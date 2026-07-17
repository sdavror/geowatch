import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OfacSdnAdapter } from './ofac-sdn.adapter';
import { GleifAdapter } from './gleif.adapter';
import { EntityResolutionService, type NormalizedEntityRecord, type IdentifierType } from './entity-resolution.service';

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

  async ingestOfac(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'OFAC SDN',
      'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml',
      'company',
    );
    const countryMap = await this.buildCountryNameMap();
    const entities = await this.ofac.fetchEntities();

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
      const result = await this.resolution.resolve(record, source.id);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `OFAC entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
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

    const identifiers = [{ type: 'lei' as IdentifierType, value: top.lei, countryId: '' }];
    if (top.registeredAs) {
      identifiers.push({
        type: 'reg_number' as IdentifierType,
        value: top.registeredAs,
        countryId: top.countryIso2 ?? '',
      });
    }
    const record: NormalizedEntityRecord = {
      sourceExternalId: top.lei,
      name: top.legalName,
      aliases: top.otherNames,
      identifiers,
      primaryCountryId: top.countryIso2,
      raw: top.raw,
    };
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
    return this.resolution.resolve(record, source.id);
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
