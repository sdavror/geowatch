import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePersonName, bigramSimilarity } from './name-similarity.util';
import { LlmPersonMatchService } from './llm-person-match.service';
import type { LlmBudget, OfficerRole } from './entity-resolution.service';

interface PersonCandidateMatch {
  personId: string;
  canonicalName: string;
  confidence: number; // 0-1
  nameSimilarity: number;
  countryMatch: boolean;
  method: 'fuzzy' | 'llm';
  llmReasoning?: string;
}

export interface ResolveOfficerResult {
  personId: string;
  queuedReviewId?: string;
}

// Higher bar than Entity's 0.7 — a person-name collision across two
// unrelated companies is far more likely than a company-name collision,
// since companies have legal-suffix normalization and this project's other
// signals (registration numbers) while officer records only ever carry
// name/role/countryId. Deliberately conservative: this only controls what
// gets QUEUED for human review, never what auto-merges (there is no
// auto-merge for persons at all — see PersonMergeReviewService).
const PERSON_REVIEW_QUEUE_THRESHOLD = 0.85;
const PERSON_LLM_GRAY_ZONE_MIN = 0.65;
const PERSON_LLM_QUEUE_THRESHOLD = 75;
const CANDIDATE_POOL_LIMIT = 1000;
// Same bounded-budget shape as EntityIngestionService's OFAC_LLM_BUDGET —
// local 14B inference is slow enough that an unbounded backfill pass over
// thousands of pre-existing officer rows would take hours in one call.
const BACKFILL_LLM_BUDGET = 200;

/**
 * Cross-entity Person identity resolution — the layer EntityOfficer's own
 * doc comment calls out as deliberately out of scope ("is this John Smith
 * at Company A the same John Smith at Company B"). Mirrors the three-phase
 * shape of EntityResolutionService (exact identifier / fuzzy+country /
 * LLM gray-zone) but never auto-merges under any confidence: a fuzzy or LLM
 * hit only ever queues a PersonMergeReview, and unlike company resolution
 * there is no high-confidence auto-approve tier at all (see
 * PersonMergeReviewService) — the cost of a false person merge (wrongly
 * linking a real, unrelated individual to a sanctioned company's
 * leadership) is materially worse than a false company merge.
 */
@Injectable()
export class PersonResolutionService {
  private readonly logger = new Logger(PersonResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmPersonMatchService,
  ) {}

  /**
   * Resolves one officer record to a Person, creating a new one if nothing
   * plausible is on file. Called from EntityResolutionService.addOfficers()
   * for every newly-inserted (non-duplicate-within-entity) officer row, and
   * from the backfill sweep for existing rows that predate this feature.
   */
  async resolveOfficer(
    name: string,
    role: OfficerRole,
    countryId: string | null,
    sourceId: string,
    llmBudget?: LlmBudget,
  ): Promise<ResolveOfficerResult> {
    const fuzzyCandidate = await this.findFuzzyCandidate(name, countryId, llmBudget);

    const person = await this.prisma.person.create({
      data: { canonicalName: name, primaryCountryId: countryId },
    });

    await this.prisma.personAlias.upsert({
      where: { personId_name: { personId: person.id, name } },
      create: { personId: person.id, name, sourceId },
      update: {},
    });

    let queuedReviewId: string | undefined;
    if (fuzzyCandidate) {
      const review = await this.prisma.personMergeReview.upsert({
        where: { personAId_personBId: { personAId: fuzzyCandidate.personId, personBId: person.id } },
        create: {
          personAId: fuzzyCandidate.personId,
          personBId: person.id,
          personACanonicalName: fuzzyCandidate.canonicalName,
          personBCanonicalName: name,
          confidence: Math.round(fuzzyCandidate.confidence * 100),
          matchedOn: {
            method: fuzzyCandidate.method,
            nameSimilarity: Math.round(fuzzyCandidate.nameSimilarity * 100) / 100,
            countryMatch: fuzzyCandidate.countryMatch,
            role,
            ...(fuzzyCandidate.llmReasoning ? { llmReasoning: fuzzyCandidate.llmReasoning } : {}),
          },
        },
        update: {},
      });
      queuedReviewId = review.id;
      this.logger.debug(
        `Queued person merge review ${review.id} (${fuzzyCandidate.method}): person ${person.id} ("${name}") vs ${fuzzyCandidate.personId} — confidence ${Math.round(fuzzyCandidate.confidence * 100)}%`,
      );
    }

    return { personId: person.id, queuedReviewId };
  }

  /**
   * Phase 2 fuzzy scoring with a Phase 3 LLM gray-zone escalation — same
   * shape as EntityResolutionService.findFuzzyCandidate, but country is a
   * HARD gate here rather than a soft weight: a same-named person in two
   * different known countries is excluded from the candidate pool entirely,
   * since unlike a company (which can genuinely operate across borders
   * under one name), a person having a different reported country is much
   * stronger evidence of being a different individual.
   */
  private async findFuzzyCandidate(
    name: string,
    countryId: string | null,
    llmBudget?: LlmBudget,
  ): Promise<PersonCandidateMatch | null> {
    const targetName = normalizePersonName(name);
    const blockingToken = targetName.split(' ').find((t) => t.length >= 3);
    if (!blockingToken) return null;

    const candidates = await this.prisma.person.findMany({
      where: {
        canonicalName: { contains: blockingToken, mode: 'insensitive' },
        ...(countryId ? { OR: [{ primaryCountryId: countryId }, { primaryCountryId: null }] } : {}),
      },
      select: { id: true, canonicalName: true, primaryCountryId: true },
      take: CANDIDATE_POOL_LIMIT,
    });

    let best: PersonCandidateMatch | null = null;

    for (const c of candidates) {
      // Hard gate, not a weighted factor — see doc comment above.
      if (countryId && c.primaryCountryId && c.primaryCountryId !== countryId) continue;
      const nameSimilarity = bigramSimilarity(targetName, normalizePersonName(c.canonicalName));
      const countryMatch = !countryId || !c.primaryCountryId || c.primaryCountryId === countryId;
      const confidence = nameSimilarity;
      if (!best || confidence > best.confidence) {
        best = { personId: c.id, confidence, nameSimilarity, countryMatch, method: 'fuzzy', canonicalName: c.canonicalName };
      }
    }

    if (!best) return null;
    if (best.confidence >= PERSON_REVIEW_QUEUE_THRESHOLD) return best;

    if (best.confidence >= PERSON_LLM_GRAY_ZONE_MIN && llmBudget && llmBudget.remaining > 0) {
      llmBudget.remaining--;
      const judgment = await this.llm.judge(name, countryId, 'officer', best.canonicalName, countryId, 'officer');
      if (judgment?.isMatch && judgment.confidence >= PERSON_LLM_QUEUE_THRESHOLD) {
        return {
          personId: best.personId,
          canonicalName: best.canonicalName,
          confidence: judgment.confidence / 100,
          nameSimilarity: best.nameSimilarity,
          countryMatch: best.countryMatch,
          method: 'llm',
          llmReasoning: judgment.reasoning,
        };
      }
    }

    return null;
  }

  /**
   * One-time (safe to re-run) backfill for EntityOfficer rows ingested
   * before this feature existed — 9,801 as of this writing, all with
   * personId still null. Bounded by `limit` per call for the same reason
   * every other bulk LLM-assisted pass in this project is: call repeatedly
   * (an admin-UI button, same shape as backfill/company-profile) to work
   * through the remainder rather than one call blocking for a very long
   * time.
   */
  async backfillOfficerPersons(limit = 500): Promise<{ scanned: number; resolved: number }> {
    const officers = await this.prisma.entityOfficer.findMany({
      where: { personId: null },
      take: limit,
      select: { id: true, name: true, role: true, countryId: true, sourceId: true },
    });

    const llmBudget: LlmBudget = { remaining: BACKFILL_LLM_BUDGET };
    let resolved = 0;
    for (const o of officers) {
      const { personId, queuedReviewId } = await this.resolveOfficer(o.name, o.role, o.countryId, o.sourceId, llmBudget);
      // Conditional on personId still being null: if this exact row got
      // resolved by another call in the meantime (a retried/overlapping
      // backfill run, or a process interrupted mid-batch by a host/container
      // restart — confirmed live, 609 orphan Persons from exactly this race
      // after a Docker restart interrupted a run), this update loses the
      // race and the Person + review just created above is pure noise with
      // zero real officer attached. Clean up rather than leave it as a
      // phantom in the review queue.
      const { count } = await this.prisma.entityOfficer.updateMany({
        where: { id: o.id, personId: null },
        data: { personId },
      });
      if (count === 0) {
        if (queuedReviewId) await this.prisma.personMergeReview.deleteMany({ where: { id: queuedReviewId } });
        await this.prisma.person.delete({ where: { id: personId } }); // cascades its alias
        continue;
      }
      resolved++;
    }
    if (llmBudget.remaining === 0) {
      this.logger.warn(
        `Person backfill: LLM gray-zone budget (${BACKFILL_LLM_BUDGET}) exhausted before this batch finished — some plausible matches may not have gotten a semantic second opinion this pass.`,
      );
    }
    return { scanned: officers.length, resolved };
  }
}
