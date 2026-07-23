import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmPersonMatchService } from './llm-person-match.service';

/**
 * Executes (or dismisses) a Phase 2/3 person-match suggestion. Unlike
 * EntityMergeReviewService, there is deliberately NO high-confidence
 * auto-approve tier here — every real person merge requires a human
 * clicking "approve" on a specific candidate, no matter how high the
 * string-similarity score. The daily LLM second pass can still
 * auto-REJECT a clearly-wrong pairing (safe direction: worst case a real
 * duplicate stays split, which just means slightly less complete data),
 * but it never auto-approves. Approving moves personB's officer rows
 * (and aliases/identifiers) onto personA and removes personB; rejecting
 * just marks the review dismissed and leaves both persons as they are.
 */
@Injectable()
export class PersonMergeReviewService {
  private readonly logger = new Logger(PersonMergeReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmPersonMatchService,
  ) {}

  /**
   * Called from EntityMergeReviewService's existing daily cron as an
   * additional bounded pass (not its own separate cron — one nightly
   * maintenance job, same log line shape). `reviewerId: null` marks these
   * as system decisions in the audit trail.
   */
  async scheduledQueueMaintenance() {
    try {
      const llmPass = await this.llmJudgeUnreviewedFuzzy(null, 300);
      this.logger.log(
        `Person review queue maintenance: LLM pass ${llmPass.rejected} auto-rejected, ${llmPass.inconclusive} inconclusive ` +
          `of ${llmPass.scanned} (${llmPass.llmUnavailable} unavailable) — approvals always require a human`,
      );
    } catch (err) {
      this.logger.error(`Scheduled person review-queue maintenance failed: ${(err as Error).message}`);
    }
  }

  async listPending() {
    // Surfaces WHICH companies each side is linked to and whether those
    // companies are sanctioned (regime = whose list, program = the stated
    // basis) — a reviewer deciding "is this the same person" needs that
    // context, not just two bare names and a confidence score.
    const officerRolesInclude = {
      select: {
        role: true,
        entity: {
          select: {
            id: true,
            canonicalName: true,
            sanctions: { select: { regime: true, program: true } },
          },
        },
      },
    };
    return this.prisma.personMergeReview.findMany({
      where: { status: 'pending' },
      orderBy: { confidence: 'desc' },
      include: {
        personA: {
          select: {
            id: true,
            canonicalName: true,
            primaryCountryId: true,
            aliases: { select: { name: true } },
            officerRoles: officerRolesInclude,
          },
        },
        personB: {
          select: {
            id: true,
            canonicalName: true,
            primaryCountryId: true,
            aliases: { select: { name: true } },
            officerRoles: officerRolesInclude,
          },
        },
      },
    });
  }

  async approve(reviewId: string, reviewerId: string | null) {
    const review = await this.getPendingOrThrow(reviewId);

    const [aliases, identifiers, officers] = await Promise.all([
      this.prisma.personAlias.findMany({ where: { personId: review.personBId } }),
      this.prisma.personIdentifier.findMany({ where: { personId: review.personBId } }),
      this.prisma.entityOfficer.findMany({ where: { personId: review.personBId } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      for (const a of aliases) {
        await tx.personAlias.upsert({
          where: { personId_name: { personId: review.personAId, name: a.name } },
          create: { personId: review.personAId, name: a.name, sourceId: a.sourceId },
          update: {},
        });
      }
      for (const id of identifiers) {
        await tx.personIdentifier.upsert({
          where: { type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId } },
          create: {
            personId: review.personAId,
            type: id.type,
            value: id.value,
            countryId: id.countryId,
            sourceId: id.sourceId,
          },
          // Defensive re-point, mirrors EntityMergeReviewService — shouldn't
          // happen (an exact identifier match would already have resolved
          // Phase 1), but a wrong assumption here shouldn't error the merge.
          update: { personId: review.personAId },
        });
      }
      for (const o of officers) {
        await tx.entityOfficer.update({ where: { id: o.id }, data: { personId: review.personAId } });
      }
      // Mark approved BEFORE deleting personB — same ordering fix as
      // EntityMergeReviewService.approve(): PersonMergeReview's own FKs are
      // SetNull, but deleting personB cascades away any OTHER pending
      // review naming it, so the status update must land first.
      await tx.personMergeReview.update({
        where: { id: reviewId },
        data: { status: 'approved', reviewerId, reviewedAt: new Date() },
      });
      await tx.person.delete({ where: { id: review.personBId } });
    });

    return { merged: true, personId: review.personAId };
  }

  /**
   * Extends Phase 3 to `method: 'fuzzy'` reviews that never got an LLM
   * opinion (those only ever get one at ingestion time inside the
   * 0.65-0.85 gray zone — anything that queued at >=0.85 skipped straight
   * past the LLM). Unlike EntityMergeReviewService's equivalent, a
   * confident LLM agreement here does NOT auto-approve — it's just
   * recorded on the review for a human to weigh. Only a confident
   * disagreement acts automatically (auto-reject), since that direction
   * carries no false-merge risk.
   */
  async llmJudgeUnreviewedFuzzy(
    reviewerId: string | null,
    limit = 150,
  ): Promise<{ scanned: number; rejected: number; inconclusive: number; llmUnavailable: number }> {
    const candidates = await this.prisma.personMergeReview.findMany({
      where: {
        status: 'pending',
        matchedOn: { path: ['method'], equals: 'fuzzy' },
      },
      take: limit * 2,
      orderBy: { confidence: 'desc' },
      include: {
        personA: { select: { canonicalName: true, primaryCountryId: true } },
        personB: { select: { canonicalName: true, primaryCountryId: true } },
      },
    });

    const eligible = candidates
      .filter((c) => {
        const m = c.matchedOn as { llmSecondPassChecked?: boolean };
        return !m.llmSecondPassChecked && c.personA && c.personB;
      })
      .slice(0, limit);

    let rejected = 0;
    let inconclusive = 0;
    let llmUnavailable = 0;

    for (const c of eligible) {
      const stillPending = await this.prisma.personMergeReview.findUnique({
        where: { id: c.id },
        select: { status: true },
      });
      if (stillPending?.status !== 'pending') continue;

      const matchedOn = c.matchedOn as Record<string, unknown>;
      const role = typeof matchedOn.role === 'string' ? matchedOn.role : 'officer';
      const judgment = await this.llm.judge(
        c.personA!.canonicalName,
        c.personA!.primaryCountryId,
        role,
        c.personB!.canonicalName,
        c.personB!.primaryCountryId,
        role,
      );

      if (!judgment) {
        llmUnavailable++;
        continue; // don't mark checked — Ollama being down shouldn't permanently skip this item
      }

      if (!judgment.isMatch && judgment.confidence >= 70) {
        await this.prisma.personMergeReview.update({
          where: { id: c.id },
          data: {
            status: 'rejected',
            reviewerId,
            reviewedAt: new Date(),
            matchedOn: { ...matchedOn, llmSecondPassChecked: true, llmSecondPassReasoning: judgment.reasoning },
          },
        });
        rejected++;
      } else {
        // Includes the isMatch:true case — annotated for the reviewer, but
        // left pending. Never auto-approved.
        await this.prisma.personMergeReview.update({
          where: { id: c.id },
          data: {
            matchedOn: {
              ...matchedOn,
              llmSecondPassChecked: true,
              llmSecondPassConfidence: judgment.confidence,
              llmSecondPassReasoning: judgment.reasoning,
              llmSecondPassIsMatch: judgment.isMatch,
            },
          },
        });
        inconclusive++;
      }
    }

    return { scanned: eligible.length, rejected, inconclusive, llmUnavailable };
  }

  async reject(reviewId: string, reviewerId: string | null) {
    await this.getPendingOrThrow(reviewId);
    await this.prisma.personMergeReview.update({
      where: { id: reviewId },
      data: { status: 'rejected', reviewerId, reviewedAt: new Date() },
    });
    return { merged: false };
  }

  private async getPendingOrThrow(reviewId: string): Promise<{ id: string; personAId: string; personBId: string }> {
    const review = await this.prisma.personMergeReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException(`Person merge review "${reviewId}" not found`);
    if (review.status !== 'pending') throw new BadRequestException('This review was already resolved');
    if (!review.personAId || !review.personBId) {
      throw new BadRequestException(`Person merge review "${reviewId}" is pending but missing a person reference`);
    }
    return { id: review.id, personAId: review.personAId, personBId: review.personBId };
  }
}
