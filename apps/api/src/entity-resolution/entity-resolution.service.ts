import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCompanyName, bigramSimilarity } from './name-similarity.util';

export type IdentifierType = 'lei' | 'reg_number' | 'tax_id';

export interface NormalizedIdentifier {
  type: IdentifierType;
  value: string;
  // Empty string for globally-unique identifiers (LEI); an ISO2 code for
  // nationally-scoped ones (a registration/tax number is only unique within
  // its own country — the same digits could theoretically appear in two
  // different jurisdictions).
  countryId: string;
}

export interface NormalizedEntityRecord {
  sourceExternalId: string;
  name: string;
  aliases: string[];
  identifiers: NormalizedIdentifier[];
  sanctions?: Array<{ regime: string; program: string }>;
  // Best-known country for this record — used only to bound the Phase 2
  // fuzzy-candidate search, not for identifier matching.
  primaryCountryId?: string | null;
  raw: unknown;
}

export interface ResolveResult {
  entityId: string;
  merged: boolean; // true if this record matched an existing Entity by identifier
  // Set when Phase 2's fuzzy pass found a plausible-but-unconfirmed match
  // and queued it for human review — the record still got its own new
  // Entity (entityId above), this is purely informational.
  queuedReviewId?: string;
}

// Below this, a fuzzy candidate isn't worth surfacing to a reviewer at all
// (too much noise). Deliberately NOT a merge threshold — nothing in Phase 2
// auto-merges regardless of how high the score climbs; that's the whole
// point of a "Needs Review" queue instead of an auto-merge cutoff.
const REVIEW_QUEUE_THRESHOLD = 0.7;
// How many same-country (or country-unknown) entities to pull as fuzzy
// candidates per unmatched record — bounds the comparison cost; this
// project's Phase 1 scope (~4,400 RU/UA/BY entities) keeps per-country
// pools well under this even without the country filter helping much yet.
const CANDIDATE_POOL_LIMIT = 1000;

/**
 * Phase 1 of the Entity Resolution Engine: identifier-only matching. No
 * fuzzy name similarity, no LLM suggestion — those are Phase 2/3. A record
 * merges into an existing Entity ONLY when it shares an identifier
 * (type + value + countryId) with one already on file; otherwise it becomes
 * a new Entity. This is deliberately conservative: a wrong automatic merge
 * silently attributes one company's sanctions/aliases to a different real
 * company, and that's much harder to notice and undo than simply having two
 * separate Entity rows that a later fuzzy/LLM pass can propose merging.
 */
@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(record: NormalizedEntityRecord, sourceId: string): Promise<ResolveResult> {
    // Idempotency check FIRST, before any identifier/fuzzy matching: if this
    // exact source record was already ingested once, always resume the
    // entity it landed on. Without this, a record with no structured
    // identifiers (common — most OFAC entries have none) has no stable key
    // to match on across re-ingestions, so a straight re-run would either
    // create a fresh duplicate every time or roll the dice on the fuzzy
    // pass finding its own previous entity. Confirmed live: re-running OFAC
    // ingestion on identical data produced 594 duplicate entities before
    // this check existed.
    const existingLink = await this.prisma.entitySourceLink.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: record.sourceExternalId } },
      select: { entityId: true },
    });
    let matchedEntityId: string | null = existingLink?.entityId ?? null;
    for (const id of matchedEntityId ? [] : record.identifiers) {
      const existing = await this.prisma.entityIdentifier.findUnique({
        where: {
          type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId },
        },
        select: { entityId: true },
      });
      if (existing) {
        matchedEntityId = existing.entityId;
        break;
      }
    }

    // Phase 2: no identifier matched — before creating a brand-new Entity,
    // check whether an existing one looks like a plausible fuzzy match. If
    // so we still create the new Entity (ingestion never blocks on review),
    // but also queue a review row so a human can confirm/reject the merge.
    let fuzzyCandidate: { entityId: string; confidence: number; nameSimilarity: number; countryMatch: boolean } | null = null;
    if (!matchedEntityId) {
      fuzzyCandidate = await this.findFuzzyCandidate(record);
    }

    const entityId =
      matchedEntityId ??
      (
        await this.prisma.entity.create({
          data: {
            entityType: 'company',
            canonicalName: record.name,
            primaryCountryId: record.primaryCountryId || null,
          },
        })
      ).id;

    // Self-healing backfill: an entity created before primaryCountryId
    // existed (or from a source that didn't know the country yet) stays
    // null forever otherwise — re-ingestion never re-runs the create()
    // branch for an already-matched entity. Any later record that DOES
    // know the country fills the gap.
    if (matchedEntityId && record.primaryCountryId) {
      await this.prisma.entity.updateMany({
        where: { id: matchedEntityId, primaryCountryId: null },
        data: { primaryCountryId: record.primaryCountryId },
      });
    }

    const allNames = [record.name, ...record.aliases];
    for (const name of new Set(allNames)) {
      await this.prisma.entityAlias.upsert({
        where: { entityId_name: { entityId, name } },
        create: { entityId, name, sourceId },
        update: {},
      });
    }

    for (const id of record.identifiers) {
      await this.prisma.entityIdentifier.upsert({
        where: {
          type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId },
        },
        // If this identifier already existed it belongs to matchedEntityId
        // (that's how we got here) — the create branch only fires for
        // genuinely new identifiers on this entity.
        create: { entityId, type: id.type, value: id.value, countryId: id.countryId, sourceId },
        update: {},
      });
    }

    await this.prisma.entitySourceLink.upsert({
      where: { sourceId_externalId: { sourceId, externalId: record.sourceExternalId } },
      create: {
        entityId,
        sourceId,
        externalId: record.sourceExternalId,
        rawPayload: record.raw as Prisma.InputJsonValue,
      },
      update: { entityId, rawPayload: record.raw as Prisma.InputJsonValue, fetchedAt: new Date() },
    });

    for (const s of record.sanctions ?? []) {
      await this.prisma.entitySanction.upsert({
        where: { entityId_regime_program: { entityId, regime: s.regime, program: s.program } },
        create: { entityId, regime: s.regime, program: s.program, sourceId },
        update: {},
      });
    }

    if (matchedEntityId) {
      this.logger.debug(`Merged "${record.name}" into existing entity ${matchedEntityId} by identifier match`);
    }

    let queuedReviewId: string | undefined;
    if (fuzzyCandidate && fuzzyCandidate.entityId !== entityId) {
      const review = await this.prisma.entityMergeReview.upsert({
        where: { entityAId_entityBId: { entityAId: fuzzyCandidate.entityId, entityBId: entityId } },
        create: {
          entityAId: fuzzyCandidate.entityId,
          entityBId: entityId,
          confidence: Math.round(fuzzyCandidate.confidence * 100),
          matchedOn: {
            nameSimilarity: Math.round(fuzzyCandidate.nameSimilarity * 100) / 100,
            countryMatch: fuzzyCandidate.countryMatch,
          },
        },
        update: {},
      });
      queuedReviewId = review.id;
      this.logger.debug(
        `Queued merge review ${review.id}: entity ${entityId} ("${record.name}") vs ${fuzzyCandidate.entityId} — confidence ${Math.round(fuzzyCandidate.confidence * 100)}%`,
      );
    }

    return { entityId, merged: matchedEntityId !== null, queuedReviewId };
  }

  /**
   * Phase 2 fuzzy pass — only runs when identifier matching found nothing.
   * Scores every same-country (or country-unknown) existing entity's
   * canonical name against this record's, returns the best candidate above
   * the review threshold. Never merges; the caller only queues a review row.
   */
  private async findFuzzyCandidate(
    record: NormalizedEntityRecord,
  ): Promise<{ entityId: string; confidence: number; nameSimilarity: number; countryMatch: boolean } | null> {
    const country = record.primaryCountryId || null;
    const targetName = normalizeCompanyName(record.name);

    // A plain country-scoped LIMIT would return an ARBITRARY slice of a
    // multi-thousand-row country (Postgres doesn't order it for you) — the
    // real match could easily fall outside that slice. Block on the first
    // significant token of the normalized name instead: cheap, and it
    // guarantees anything actually sharing that word is in the pool. This
    // misses matches with zero shared vocabulary in the first word (a
    // genuine limitation of Phase 2's blocking strategy, not a bug to work
    // around here — Phase 3's LLM pass can catch what this blocks out).
    const blockingToken = targetName.split(' ').find((t) => t.length >= 3);
    if (!blockingToken) return null;

    const candidates = await this.prisma.entity.findMany({
      where: {
        canonicalName: { contains: blockingToken, mode: 'insensitive' },
        ...(country ? { OR: [{ primaryCountryId: country }, { primaryCountryId: null }] } : {}),
      },
      select: { id: true, canonicalName: true, primaryCountryId: true },
      take: CANDIDATE_POOL_LIMIT,
    });

    let best: { entityId: string; confidence: number; nameSimilarity: number; countryMatch: boolean } | null = null;

    for (const c of candidates) {
      const nameSimilarity = bigramSimilarity(targetName, normalizeCompanyName(c.canonicalName));
      const countryMatch = !country || !c.primaryCountryId || c.primaryCountryId === country;
      // Name carries most of the signal (0.7); country agreement is a
      // secondary corroborating factor (0.3) — matches the weighting
      // rationale from the original design draft (name 40%, country 20%,
      // scaled here to the two structured signals Phase 2 actually has;
      // address/website/directors are deferred until that data exists).
      const confidence = nameSimilarity * 0.7 + (countryMatch ? 1 : 0) * 0.3;
      if (confidence >= REVIEW_QUEUE_THRESHOLD && (!best || confidence > best.confidence)) {
        best = { entityId: c.id, confidence, nameSimilarity, countryMatch };
      }
    }
    return best;
  }
}
