import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OfacSdnAdapter } from './ofac-sdn.adapter';
import { GleifAdapter } from './gleif.adapter';
import { EuSanctionsAdapter } from './eu-sanctions.adapter';
import { OfsiAdapter } from './ofsi.adapter';
import {
  EntityResolutionService,
  type NormalizedEntityRecord,
  type IdentifierType,
  type LlmBudget,
} from './entity-resolution.service';

// Local 14B inference takes real seconds per call — bounds one ingestion
// run's LLM usage so a large batch (thousands of records, most of which
// will have zero real gray-zone candidates) can't turn into an hours-long
// run. In steady state this rarely gets close: re-ingestion is idempotent
// (see EntityResolutionService.resolve), so only genuinely NEW records
// without identifiers ever reach the gray-zone check at all.
const OFAC_LLM_BUDGET = 200;

// OFAC's free-text country names occasionally don't match our Country.name
// spelling exactly — same pattern as the UCDP alias table in conflict.service.ts.
// "Region: Crimea" → Ukraine matches this project's existing convention
// (Crimea is UN-recognised Ukrainian territory at the map-geometry level too).
const OFAC_COUNTRY_NAME_ALIASES: Record<string, string> = {
  'bahamas, the': 'bahamas',
  'czech republic': 'czechia',
  'korea, south': 'south korea',
  'korea, north': 'north korea',
  'region: crimea': 'ukraine',
  'region: russia': 'russia',
};

export interface IngestSummary {
  processed: number;
  created: number;
  merged: number;
}

/**
 * Ties the per-source adapters to the resolution engine. Each ingest method
 * fetches from exactly one source, normalizes into NormalizedEntityRecord,
 * and hands each record to EntityResolutionService — the adapters
 * themselves never see each other's data or make merge decisions.
 */
@Injectable()
export class EntityIngestionService {
  private readonly logger = new Logger(EntityIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ofac: OfacSdnAdapter,
    private readonly gleif: GleifAdapter,
    private readonly euSanctions: EuSanctionsAdapter,
    private readonly ofsi: OfsiAdapter,
    private readonly resolution: EntityResolutionService,
  ) {}

  @Cron('0 0 4 * * 1') // Mondays 04:00 UTC
  async scheduledOfacRefresh() {
    try {
      await this.ingestOfac();
    } catch (err) {
      this.logger.error(`Scheduled OFAC entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 30 4 * * 1') // Mondays 04:30 UTC — staggered after OFAC
  async scheduledEuRefresh() {
    try {
      await this.ingestEuSanctions();
    } catch (err) {
      this.logger.error(`Scheduled EU entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 0 5 * * 1') // Mondays 05:00 UTC — staggered after EU
  async scheduledOfsiRefresh() {
    try {
      await this.ingestOfsi();
    } catch (err) {
      this.logger.error(`Scheduled OFSI entity ingestion failed: ${(err as Error).message}`);
    }
  }

  async ingestOfac(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'OFAC SDN',
      'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml',
      'company',
    );
    const countryMap = await this.buildCountryNameMap();
    const entities = await this.ofac.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const identifiers = e.identifiers.map((id) => ({
        type: id.type as IdentifierType,
        value: id.value,
        countryId: countryMap.get(this.normalizeCountryName(id.countryName)) ?? '',
      }));
      // Prefer an identifier's own country (most specific — it's literally
      // "registered in X"); fall back to the entity's first listed address.
      const primaryCountryId =
        identifiers.find((i) => i.countryId)?.countryId ||
        countryMap.get(this.normalizeCountryName(e.addressCountryNames[0] ?? null)) ||
        null;
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers,
        sanctions: e.programs.map((p) => ({ regime: 'OFAC', program: p })),
        primaryCountryId,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }
    if (llmBudget.remaining === 0) {
      this.logger.warn(`OFAC entity ingestion: LLM gray-zone budget (${OFAC_LLM_BUDGET}) exhausted before the run finished — some plausible matches may not have gotten a semantic second opinion this pass.`);
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `OFAC entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  async ingestEuSanctions(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'EU Consolidated Sanctions List',
      'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1',
      'company',
    );
    const entities = await this.euSanctions.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const identifiers = e.identifiers.map((id) => ({
        type: id.type,
        value: id.value,
        countryId: id.countryIso2 ?? '', // EU gives ISO2 directly, no name mapping needed
      }));
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers,
        sanctions: e.programs.map((p) => ({ regime: 'EU', program: p })),
        primaryCountryId: identifiers.find((i) => i.countryId)?.countryId || null,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `EU entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  async ingestOfsi(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'UK OFSI Consolidated List',
      'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml',
      'company',
    );
    const countryMap = await this.buildCountryNameMap();
    const entities = await this.ofsi.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const identifiers = [];
      for (const id of e.identifiers) {
        const countryId = countryMap.get(this.normalizeCountryName(id.countryName)) ?? '';
        // OFSI's field is free text and doesn't say whether a given number
        // is a registration number or a tax ID — check both before
        // defaulting, so this doesn't collide-on-value-but-miss-on-type
        // against an identifier another source already stored correctly.
        const type = await this.resolution.resolveIdentifierType(id.value, countryId, ['reg_number', 'tax_id']);
        identifiers.push({ type, value: id.value, countryId });
      }
      const primaryCountryId =
        identifiers.find((i) => i.countryId)?.countryId ||
        countryMap.get(this.normalizeCountryName(e.countryName)) ||
        null;
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers,
        sanctions: e.programs.map((p) => ({ regime: 'UK OFSI', program: p })),
        primaryCountryId,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `UK OFSI entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * Fetches GLEIF's direct-parent and direct-children for an entity's known
   * LEI, resolves each through the normal pipeline (so a parent/child that
   * already exists from another source correctly links to it rather than
   * duplicating), and records the ownership edges. Requires the entity to
   * already carry an LEI identifier — call enrichWithGleif() first if it
   * doesn't have one yet.
   */
  async enrichRelationshipsWithGleif(
    entityId: string,
  ): Promise<{ lei: string | null; parentLinked: boolean; childrenLinked: number }> {
    const leiRow = await this.prisma.entityIdentifier.findFirst({
      where: { entityId, type: 'lei' },
      select: { value: true },
    });
    if (!leiRow) return { lei: null, parentLinked: false, childrenLinked: 0 };

    const source = await this.getOrCreateSource('GLEIF', 'https://api.gleif.org/api/v1', 'company');
    let parentLinked = false;

    const parent = await this.gleif.fetchDirectParent(leiRow.value);
    if (parent?.lei) {
      const parentRecord = this.gleifRecordToNormalized(parent);
      const { entityId: parentEntityId } = await this.resolution.resolve(parentRecord, source.id);
      if (parentEntityId !== entityId) {
        await this.prisma.entityRelationship.upsert({
          where: { parentId_childId: { parentId: parentEntityId, childId: entityId } },
          create: { parentId: parentEntityId, childId: entityId, sourceId: source.id },
          update: {},
        });
        parentLinked = true;
      }
    }

    const children = await this.gleif.fetchDirectChildren(leiRow.value);
    let childrenLinked = 0;
    for (const child of children) {
      if (!child.lei) continue;
      const childRecord = this.gleifRecordToNormalized(child);
      const { entityId: childEntityId } = await this.resolution.resolve(childRecord, source.id);
      if (childEntityId === entityId) continue;
      await this.prisma.entityRelationship.upsert({
        where: { parentId_childId: { parentId: entityId, childId: childEntityId } },
        create: { parentId: entityId, childId: childEntityId, sourceId: source.id },
        update: {},
      });
      childrenLinked++;
    }

    return { lei: leiRow.value, parentLinked, childrenLinked };
  }

  private gleifRecordToNormalized(g: {
    lei: string;
    legalName: string;
    otherNames: string[];
    registeredAs: string | null;
    countryIso2: string | null;
    raw: unknown;
  }): NormalizedEntityRecord {
    const identifiers = [{ type: 'lei' as IdentifierType, value: g.lei, countryId: '' }];
    if (g.registeredAs) {
      identifiers.push({ type: 'reg_number' as IdentifierType, value: g.registeredAs, countryId: g.countryIso2 ?? '' });
    }
    return {
      sourceExternalId: g.lei,
      name: g.legalName,
      aliases: g.otherNames,
      identifiers,
      primaryCountryId: g.countryIso2,
      raw: g.raw,
    };
  }

  /**
   * On-demand enrichment for ONE already-resolved entity — not a batch cron
   * over the full OFAC-derived entity set. GLEIF's fulltext search is a
   * discovery mechanism (find a candidate record by name), not a matching
   * decision; the actual merge still goes through EntityResolutionService's
   * identifier equality check like every other source.
   */
  async enrichWithGleif(entityId: string): Promise<{ found: boolean; lei?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    const source = await this.getOrCreateSource('GLEIF', 'https://api.gleif.org/api/v1', 'company');
    const results = await this.gleif.searchByName(entity.canonicalName);
    if (results.length === 0) return { found: false };

    const top = results[0];
    if (!top.lei) return { found: false };

    const record = this.gleifRecordToNormalized(top);
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, lei: top.lei, matchedExisting: result.entityId === entityId };
  }

  /**
   * Resolves a bare name (no identifiers) against the existing entity graph
   * — the shape a mention extracted from article text would have. Doubles
   * as the Phase 2 fuzzy-matching verification tool now and as the seed for
   * Phase 4 (linking sanctioned companies to the articles that mention
   * them) later.
   */
  async resolveByName(name: string, countryId?: string | null) {
    const source = await this.getOrCreateSource('Manual/Text mention', 'internal://manual', 'company');
    const record: NormalizedEntityRecord = {
      sourceExternalId: `manual:${name}`,
      name,
      aliases: [],
      identifiers: [],
      primaryCountryId: countryId ?? null,
      raw: { manual: true, name },
    };
    // Small per-call budget — this is a single manual lookup (verification
    // tool / future article-mention linking), not a batch job, so one LLM
    // call is the natural cap rather than borrowing the ingestion-sized one.
    return this.resolution.resolve(record, source.id, { remaining: 1 });
  }

  private async getOrCreateSource(name: string, url: string, entityType: string) {
    const existing = await this.prisma.source.findFirst({ where: { name } });
    if (existing) return existing;
    return this.prisma.source.create({
      data: {
        name,
        url,
        type: 'api',
        entityType,
        trustScore: 10,
        active: true,
        // Weekly — these registries don't change fast enough to justify
        // the RSS-ingestion cadence other Source rows use.
        fetchIntervalMinutes: 60 * 24 * 7,
      },
    });
  }

  private async buildCountryNameMap(): Promise<Map<string, string>> {
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
    const map = new Map<string, string>();
    for (const c of countries) map.set(c.name.toLowerCase(), c.id);
    return map;
  }

  private normalizeCountryName(name: string | null): string {
    if (!name) return '';
    const lower = name.trim().toLowerCase();
    return OFAC_COUNTRY_NAME_ALIASES[lower] ?? lower;
  }
}
