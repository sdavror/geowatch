import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmEntityMatchService } from './llm-entity-match.service';

/**
 * Executes (or dismisses) a Phase 2 fuzzy-match suggestion. Nothing here
 * runs automatically — every merge is a human clicking "approve" on a
 * specific confidence-scored candidate. Approving moves entityB's data onto
 * entityA and removes entityB; rejecting just marks the review dismissed
 * and leaves both entities as they are.
 */
@Injectable()
export class EntityMergeReviewService {
  private readonly logger = new Logger(EntityMergeReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmEntityMatchService,
  ) {}

  async listPending() {
    return this.prisma.entityMergeReview.findMany({
      where: { status: 'pending' },
      orderBy: { confidence: 'desc' },
      include: {
        entityA: {
          select: { id: true, canonicalName: true, primaryCountryId: true, aliases: { select: { name: true } } },
        },
        entityB: {
          select: { id: true, canonicalName: true, primaryCountryId: true, aliases: { select: { name: true } } },
        },
      },
    });
  }

  async approve(reviewId: string, reviewerId: string) {
    const review = await this.getPendingOrThrow(reviewId);

    const [entityB, aliases, identifiers, sanctions, sourceLinks, officers, relsAsParent, relsAsChild] =
      await Promise.all([
        this.prisma.entity.findUniqueOrThrow({ where: { id: review.entityBId } }),
        this.prisma.entityAlias.findMany({ where: { entityId: review.entityBId } }),
        this.prisma.entityIdentifier.findMany({ where: { entityId: review.entityBId } }),
        this.prisma.entitySanction.findMany({ where: { entityId: review.entityBId } }),
        this.prisma.entitySourceLink.findMany({ where: { entityId: review.entityBId } }),
        this.prisma.entityOfficer.findMany({ where: { entityId: review.entityBId } }),
        this.prisma.entityRelationship.findMany({ where: { parentId: review.entityBId } }),
        this.prisma.entityRelationship.findMany({ where: { childId: review.entityBId } }),
      ]);

    await this.prisma.$transaction(async (tx) => {
      for (const a of aliases) {
        await tx.entityAlias.upsert({
          where: { entityId_name: { entityId: review.entityAId, name: a.name } },
          create: { entityId: review.entityAId, name: a.name, sourceId: a.sourceId },
          update: {},
        });
      }
      for (const id of identifiers) {
        await tx.entityIdentifier.upsert({
          where: { type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId } },
          create: {
            entityId: review.entityAId,
            type: id.type,
            value: id.value,
            countryId: id.countryId,
            sourceId: id.sourceId,
          },
          // If entityA somehow already carries this exact identifier
          // (shouldn't happen — that would have exact-matched in Phase 1),
          // re-point it defensively rather than error out the whole merge.
          update: { entityId: review.entityAId },
        });
      }
      for (const s of sanctions) {
        await tx.entitySanction.upsert({
          where: { entityId_regime_program: { entityId: review.entityAId, regime: s.regime, program: s.program } },
          create: { entityId: review.entityAId, regime: s.regime, program: s.program, sourceId: s.sourceId },
          update: {},
        });
      }
      for (const link of sourceLinks) {
        await tx.entitySourceLink.update({ where: { id: link.id }, data: { entityId: review.entityAId } });
      }
      // Real gap found live: EntityOfficer and EntityRelationship were both
      // added to the schema after this method was written — without this,
      // every approved merge silently discarded entityB's officers (its
      // rows cascade-delete with the entity) and orphaned/dropped its
      // ownership edges. Same upsert-onto-A pattern as aliases/identifiers.
      for (const o of officers) {
        await tx.entityOfficer.upsert({
          where: {
            entityId_name_role_sourceId: { entityId: review.entityAId, name: o.name, role: o.role, sourceId: o.sourceId },
          },
          create: { entityId: review.entityAId, name: o.name, role: o.role, countryId: o.countryId, sourceId: o.sourceId },
          update: {},
        });
      }
      for (const rel of relsAsParent) {
        if (rel.childId === review.entityAId) continue; // would become a self-relationship
        await tx.entityRelationship.upsert({
          where: { parentId_childId: { parentId: review.entityAId, childId: rel.childId } },
          create: { parentId: review.entityAId, childId: rel.childId, sourceId: rel.sourceId },
          update: {},
        });
      }
      for (const rel of relsAsChild) {
        if (rel.parentId === review.entityAId) continue;
        await tx.entityRelationship.upsert({
          where: { parentId_childId: { parentId: rel.parentId, childId: review.entityAId } },
          create: { parentId: rel.parentId, childId: review.entityAId, sourceId: rel.sourceId },
          update: {},
        });
      }
      // Profile fields (Track A): same self-healing "fill only if null"
      // rule as EntityResolutionService.fillProfileFields — entityA's own
      // value (if any) always wins, entityB's fills the gaps.
      const profileFields: Array<keyof typeof entityB> = [
        'website',
        'status',
        'industryCode',
        'industryLabel',
        'addressLine',
        'addressCity',
        'addressPostalCode',
      ];
      for (const field of profileFields) {
        const value = entityB[field];
        if (value) {
          await tx.entity.updateMany({
            where: { id: review.entityAId, [field]: null },
            data: { [field]: value },
          });
        }
      }
      // Mark this review approved BEFORE deleting entityB — the FK from
      // EntityMergeReview.entityB is ON DELETE CASCADE, so deleting the
      // entity first would cascade-delete this very review row and leave
      // nothing for the update below to find.
      await tx.entityMergeReview.update({
        where: { id: reviewId },
        data: { status: 'approved', reviewerId, reviewedAt: new Date() },
      });
      // Cascades away entityB's now-empty child rows plus any OTHER pending
      // review that also named entityB — a merge decision on one candidate
      // implicitly resolves any other queued suggestion for the entity
      // being removed.
      await tx.entity.delete({ where: { id: review.entityBId } });
    });

    return { merged: true, entityId: review.entityAId };
  }

  /**
   * Bulk-approves only the safest tier of the pending queue: near-exact
   * name matches (fuzzy, not LLM — LLM judgments only fire in the 0.35-0.7
   * gray zone by construction, so they're never this confident on string
   * similarity alone) within the same country. Deliberately conservative —
   * this is "the same company under two spellings" territory (e.g. "LLC
   * Synesis" vs "Synesis"), not a heuristic for genuinely ambiguous cases,
   * which stay queued for a human. Everything below the threshold is left
   * exactly where it is.
   */
  async autoApproveHighConfidence(
    reviewerId: string,
    minConfidence = 95,
  ): Promise<{ scanned: number; approved: number; failed: number }> {
    const candidates = await this.prisma.entityMergeReview.findMany({
      where: { status: 'pending', confidence: { gte: minConfidence } },
      select: { id: true, matchedOn: true },
    });
    const eligible = candidates.filter((c) => {
      const m = c.matchedOn as { method?: string; countryMatch?: boolean };
      return m.method === 'fuzzy' && m.countryMatch === true;
    });

    let approved = 0;
    let failed = 0;
    for (const c of eligible) {
      try {
        // Re-check pending status per-iteration: approving one review can
        // cascade-resolve OTHERS naming the same now-deleted entity (see
        // the comment in approve()), so an earlier item in this loop may
        // have already resolved a later one.
        const stillPending = await this.prisma.entityMergeReview.findUnique({
          where: { id: c.id },
          select: { status: true },
        });
        if (stillPending?.status !== 'pending') continue;
        await this.approve(c.id, reviewerId);
        approved++;
      } catch (err) {
        failed++;
      }
    }
    return { scanned: eligible.length, approved, failed };
  }

  /**
   * Extends Phase 3 to a part of the queue it never actually reached: every
   * `method: 'fuzzy'` review has confidence >= 0.7 by construction
   * (EntityResolutionService.findFuzzyCandidate returns immediately once a
   * fuzzy match clears REVIEW_QUEUE_THRESHOLD, without ever calling the
   * LLM — that only happens in the 0.35-0.7 gray zone). So hundreds of
   * "pretty similar, same country" pairs have never gotten a semantic
   * second opinion at all. This runs one now: an LLM agreement queues it
   * for auto-approval at a stricter bar than ingestion-time (90 vs 70,
   * since this is now itself the approval signal, not just "worth a
   * human's time"); a confident LLM disagreement is real negative evidence
   * (auto-reject); anything else is left pending with a marker so repeat
   * runs don't re-judge it. Bounded by `limit` since local 14B inference
   * takes real seconds per call — call again to keep working through the
   * remainder.
   */
  async llmJudgeUnreviewedFuzzy(
    reviewerId: string,
    limit = 150,
  ): Promise<{ scanned: number; approved: number; rejected: number; inconclusive: number; llmUnavailable: number }> {
    const candidates = await this.prisma.entityMergeReview.findMany({
      where: {
        status: 'pending',
        // Real bug found live: ordering by confidence desc without this
        // filter pulled in only the ~100 leftover method='llm' reviews
        // (all higher-confidence than any remaining fuzzy one after the
        // conf>=95 auto-approve pass already ran) — eligible came back
        // empty every time despite hundreds of real fuzzy candidates
        // existing. Filter server-side on the JSON method field instead of
        // hoping ordering/take happens to surface fuzzy rows.
        matchedOn: { path: ['method'], equals: 'fuzzy' },
      },
      take: limit * 2, // over-fetch since the already-checked filter below still runs in JS
      orderBy: { confidence: 'desc' },
      include: {
        entityA: { select: { canonicalName: true, primaryCountryId: true } },
        entityB: { select: { canonicalName: true, primaryCountryId: true } },
      },
    });

    const eligible = candidates
      .filter((c) => {
        const m = c.matchedOn as { llmSecondPassChecked?: boolean };
        return !m.llmSecondPassChecked && c.entityA && c.entityB;
      })
      .slice(0, limit);

    let approved = 0;
    let rejected = 0;
    let inconclusive = 0;
    let llmUnavailable = 0;

    for (const c of eligible) {
      // Cascade side effects (see approve()) can resolve a later item in
      // this batch before we reach it.
      const stillPending = await this.prisma.entityMergeReview.findUnique({
        where: { id: c.id },
        select: { status: true },
      });
      if (stillPending?.status !== 'pending') continue;

      const judgment = await this.llm.judge(
        c.entityA!.canonicalName,
        c.entityA!.primaryCountryId,
        c.entityB!.canonicalName,
        c.entityB!.primaryCountryId,
      );

      if (!judgment) {
        llmUnavailable++;
        continue; // don't mark checked — Ollama being down shouldn't permanently skip this item
      }

      const matchedOn = c.matchedOn as Record<string, unknown>;
      if (judgment.isMatch && judgment.confidence >= 90) {
        try {
          await this.approve(c.id, reviewerId);
          approved++;
        } catch (err) {
          this.logger.warn(`LLM second-pass approve failed for review ${c.id}: ${(err as Error).message}`);
        }
      } else if (!judgment.isMatch && judgment.confidence >= 70) {
        await this.prisma.entityMergeReview.update({
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
        await this.prisma.entityMergeReview.update({
          where: { id: c.id },
          data: {
            matchedOn: {
              ...matchedOn,
              llmSecondPassChecked: true,
              llmSecondPassConfidence: judgment.confidence,
              llmSecondPassReasoning: judgment.reasoning,
            },
          },
        });
        inconclusive++;
      }
    }

    return { scanned: eligible.length, approved, rejected, inconclusive, llmUnavailable };
  }

  async reject(reviewId: string, reviewerId: string) {
    await this.getPendingOrThrow(reviewId);
    await this.prisma.entityMergeReview.update({
      where: { id: reviewId },
      data: { status: 'rejected', reviewerId, reviewedAt: new Date() },
    });
    return { merged: false };
  }

  // Returns entityAId/entityBId narrowed to non-null: a pending review was
  // always created with both set, and they only ever go null once the
  // review itself has moved off 'pending' (SET NULL fires on the entity
  // deletion that happens as PART of resolving a review, never before).
  private async getPendingOrThrow(reviewId: string): Promise<{ id: string; entityAId: string; entityBId: string }> {
    const review = await this.prisma.entityMergeReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException(`Merge review "${reviewId}" not found`);
    if (review.status !== 'pending') throw new BadRequestException('This review was already resolved');
    if (!review.entityAId || !review.entityBId) {
      throw new BadRequestException(`Merge review "${reviewId}" is pending but missing an entity reference`);
    }
    return { id: review.id, entityAId: review.entityAId, entityBId: review.entityBId };
  }
}
