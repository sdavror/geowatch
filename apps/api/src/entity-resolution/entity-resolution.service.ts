import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCompanyName, bigramSimilarity } from './name-similarity.util';
import { LlmEntityMatchService } from './llm-entity-match.service';

export type IdentifierType = 'lei' | 'reg_number' | 'tax_id' | 'cik';

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
  // Set when Phase 2/3's fuzzy or LLM pass found a plausible-but-unconfirmed
  // match and queued it for human review — the record still got its own new
  // Entity (entityId above), this is purely informational.
  queuedReviewId?: string;
}

// A single ingestion run shares one budget object so LLM calls stay bounded
// no matter how many gray-zone candidates a large batch turns up — local
// 14B inference is slow enough (seconds per call) that an unbounded pass
// over thousands of records would turn a minute-long ingestion into hours.
// Passed by reference; the caller (EntityIngestionService) owns the count.
export interface LlmBudget {
  remaining: number;
}

interface CandidateMatch {
  entityId: string;
  confidence: number; // 0-1
  nameSimilarity: number;
  countryMatch: boolean;
  method: 'fuzzy' | 'llm';
  llmReasoning?: string;
}

// Below this, a fuzzy candidate isn't worth surfacing to a reviewer at all
// (too much noise). Deliberately NOT a merge threshold — nothing in Phase 2
// auto-merges regardless of how high the score climbs; that's the whole
// point of a "Needs Review" queue instead of an auto-merge cutoff.
const REVIEW_QUEUE_THRESHOLD = 0.7;
// Below this, string similarity is so low that asking the LLM would almost
// always just burn GPU time confirming "no, unrelated" — not worth it.
const LLM_GRAY_ZONE_MIN = 0.35;
// The LLM's own stated confidence (0-100) needed to queue a review off its
// judgment alone. Independent of the fuzzy REVIEW_QUEUE_THRESHOLD above —
// they're different scales measuring different things (string similarity
// vs the model's semantic-equivalence confidence).
const LLM_QUEUE_THRESHOLD = 70;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmEntityMatchService,
  ) {}

  /**
   * For sources whose identifier field doesn't reliably say WHAT KIND of
   * number it is (UK OFSI's Entity_BusinessRegNumber is free text that can
   * hold a registration number, a tax ID, or something else depending on
   * jurisdiction) — checks each candidate type in order for an existing
   * match on this exact value+country, and returns the first hit. Falls
   * back to the first candidate if none match, so a genuinely-new number
   * still gets stored under a sane default type. Real bug this fixes:
   * OFSI's field held Gazprom Neft's tax ID, hard-coded as reg_number,
   * which silently created a duplicate entity because it collided on VALUE
   * but not TYPE with the tax_id OFAC had already stored for the same
   * number.
   */
  async resolveIdentifierType(
    value: string,
    countryId: string,
    candidates: IdentifierType[],
  ): Promise<IdentifierType> {
    for (const type of candidates) {
      const existing = await this.prisma.entityIdentifier.findUnique({
        where: { type_value_countryId: { type, value, countryId } },
        select: { entityId: true },
      });
      if (existing) return type;
    }
    return candidates[0];
  }

  async resolve(record: NormalizedEntityRecord, sourceId: string, llmBudget?: LlmBudget): Promise<ResolveResult> {
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

    // Phase 2/3 only apply when a record has NO identifiers of its own —
    // that's the actual "we have no other way to link this" case fuzzy/LLM
    // matching exists for. A record that already carries its own reliable
    // identifier (e.g. every SEC EDGAR record has a CIK) doesn't need a
    // name-similarity guess: if it's really the same company as something
    // else, a shared identifier will resolve that on its own later (or an
    // on-demand enrichment tool can check deliberately). Real bug this
    // fixes: bulk-ingesting ~10,400 SEC-listed companies ran fuzzy/LLM
    // against the ENTIRE cross-source entity pool for every single one —
    // financial entities share enough generic vocabulary ("Fund", "Trust",
    // "Income", "Municipal") that bigram similarity alone produced hundreds
    // of spurious high-confidence review candidates between clearly
    // unrelated companies.
    let fuzzyCandidate: CandidateMatch | null = null;
    if (!matchedEntityId && record.identifiers.length === 0) {
      fuzzyCandidate = await this.findFuzzyCandidate(record, llmBudget);
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
            method: fuzzyCandidate.method,
            nameSimilarity: Math.round(fuzzyCandidate.nameSimilarity * 100) / 100,
            countryMatch: fuzzyCandidate.countryMatch,
            ...(fuzzyCandidate.llmReasoning ? { llmReasoning: fuzzyCandidate.llmReasoning } : {}),
          },
        },
        update: {},
      });
      queuedReviewId = review.id;
      this.logger.debug(
        `Queued merge review ${review.id} (${fuzzyCandidate.method}): entity ${entityId} ("${record.name}") vs ${fuzzyCandidate.entityId} — confidence ${Math.round(fuzzyCandidate.confidence * 100)}%`,
      );
    }

    return { entityId, merged: matchedEntityId !== null, queuedReviewId };
  }

  /**
   * Fuzzy pass (Phase 2) with an LLM escalation (Phase 3) for the gray
   * zone — only runs when identifier matching found nothing. Scores every
   * same-country (or country-unknown) candidate's canonical name by string
   * similarity; a strong match queues immediately (method: 'fuzzy'). A
   * mediocre-but-not-hopeless match gets a second opinion from the local
   * LLM, which can recognize semantic equivalence plain bigram similarity
   * can't (heavy transliteration, abbreviations, translated legal names) —
   * if the model agrees with high confidence, that queues too (method:
   * 'llm'). Never merges either way; the caller only queues a review row.
   */
  private async findFuzzyCandidate(
    record: NormalizedEntityRecord,
    llmBudget?: LlmBudget,
  ): Promise<CandidateMatch | null> {
    const country = record.primaryCountryId || null;
    const targetName = normalizeCompanyName(record.name);

    // A plain country-scoped LIMIT would return an ARBITRARY slice of a
    // multi-thousand-row country (Postgres doesn't order it for you) — the
    // real match could easily fall outside that slice. Block on the first
    // significant token of the normalized name instead: cheap, and it
    // guarantees anything actually sharing that word is in the pool.
    // Known limitation NOT fixed by the LLM pass below: a record sharing
    // ZERO literal substrings with the real match (e.g. a query in Cyrillic
    // against a Latin-only canonical name) never enters this candidate
    // pool at all, so the LLM never gets a chance to judge it — the LLM
    // only re-ranks/rescues candidates this blocking step already found,
    // it doesn't independently discover matches by pure semantics. Real
    // cross-script candidate discovery would need embedding-based search,
    // out of scope here.
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

    let best: (CandidateMatch & { canonicalName: string }) | null = null;

    for (const c of candidates) {
      const nameSimilarity = bigramSimilarity(targetName, normalizeCompanyName(c.canonicalName));
      const countryMatch = !country || !c.primaryCountryId || c.primaryCountryId === country;
      // Name carries most of the signal (0.7); country agreement is a
      // secondary corroborating factor (0.3) — matches the weighting
      // rationale from the original design draft (name 40%, country 20%,
      // scaled here to the two structured signals Phase 2 actually has;
      // address/website/directors are deferred until that data exists).
      const confidence = nameSimilarity * 0.7 + (countryMatch ? 1 : 0) * 0.3;
      if (!best || confidence > best.confidence) {
        best = { entityId: c.id, confidence, nameSimilarity, countryMatch, method: 'fuzzy', canonicalName: c.canonicalName };
      }
    }

    if (!best) return null;
    if (best.confidence >= REVIEW_QUEUE_THRESHOLD) return best;

    // Gray zone: string similarity alone isn't confident enough to queue,
    // but isn't nothing either — worth a semantic second opinion, budget
    // permitting.
    if (best.confidence >= LLM_GRAY_ZONE_MIN && llmBudget && llmBudget.remaining > 0) {
      llmBudget.remaining--;
      const judgment = await this.llm.judge(record.name, country, best.canonicalName, country);
      if (judgment?.isMatch && judgment.confidence >= LLM_QUEUE_THRESHOLD) {
        return {
          entityId: best.entityId,
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
}
