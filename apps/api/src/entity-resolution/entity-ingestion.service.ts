import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { OfacSdnAdapter } from './ofac-sdn.adapter';
import { GleifAdapter } from './gleif.adapter';
import { EuSanctionsAdapter } from './eu-sanctions.adapter';
import { OfsiAdapter } from './ofsi.adapter';
import { SecEdgarAdapter } from './sec-edgar.adapter';
import { CompaniesHouseAdapter } from './companies-house.adapter';
import { FranceRegistryAdapter, type FranceRegistryResult } from './france-registry.adapter';
import { CanadaSemaAdapter } from './canada-sema.adapter';
import { AustraliaDfatAdapter } from './australia-dfat.adapter';
import { UsCslAdapter } from './us-csl.adapter';
import { EstoniaRegistryAdapter } from './estonia-registry.adapter';
import { LatviaRegistryAdapter } from './latvia-registry.adapter';
import {
  EntityResolutionService,
  type NormalizedEntityRecord,
  type IdentifierType,
  type LlmBudget,
} from './entity-resolution.service';
import { normalizeCompanyName, bigramSimilarity } from './name-similarity.util';

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
    private readonly secEdgar: SecEdgarAdapter,
    private readonly companiesHouse: CompaniesHouseAdapter,
    private readonly franceRegistry: FranceRegistryAdapter,
    private readonly canadaSema: CanadaSemaAdapter,
    private readonly australiaDfat: AustraliaDfatAdapter,
    private readonly usCsl: UsCslAdapter,
    private readonly estoniaRegistry: EstoniaRegistryAdapter,
    private readonly latviaRegistry: LatviaRegistryAdapter,
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

  @Cron('0 30 5 * * 1') // Mondays 05:30 UTC — staggered after OFSI
  async scheduledSecEdgarRefresh() {
    try {
      await this.ingestSecEdgar();
    } catch (err) {
      this.logger.error(`Scheduled SEC EDGAR entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 0 6 * * 1') // Mondays 06:00 UTC — staggered after SEC EDGAR
  async scheduledCanadaSemaRefresh() {
    try {
      await this.ingestCanadaSema();
    } catch (err) {
      this.logger.error(`Scheduled Canada SEMA entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 30 6 * * 1') // Mondays 06:30 UTC — staggered after Canada
  async scheduledAustraliaDfatRefresh() {
    try {
      await this.ingestAustraliaDfat();
    } catch (err) {
      this.logger.error(`Scheduled Australia DFAT entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 0 7 * * 1') // Mondays 07:00 UTC — staggered after Australia
  async scheduledUsCslRefresh() {
    if (!this.usCsl.configured) return; // no key registered yet — skip quietly, not an error
    try {
      await this.ingestUsCsl();
    } catch (err) {
      this.logger.error(`Scheduled US CSL entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 30 7 * * 1') // Mondays 07:30 UTC — staggered after US CSL
  async scheduledEstoniaRegistryRefresh() {
    try {
      await this.ingestEstoniaRegistry();
    } catch (err) {
      this.logger.error(`Scheduled Estonia registry entity ingestion failed: ${(err as Error).message}`);
    }
  }

  @Cron('0 0 8 * * 1') // Mondays 08:00 UTC — staggered after Estonia
  async scheduledLatviaRegistryRefresh() {
    try {
      await this.ingestLatviaRegistry();
    } catch (err) {
      this.logger.error(`Scheduled Latvia registry entity ingestion failed: ${(err as Error).message}`);
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
   * Canada's Consolidated Autonomous Sanctions List. Unlike OFAC/EU/OFSI,
   * carries no structured identifiers at all — every record here relies
   * entirely on Phase 2 fuzzy matching / Phase 3 LLM to link against
   * entities the other sources already resolved (this is exactly the "zero
   * identifiers of its own" case those phases exist for). primaryCountryId
   * is left null — Canada's "Country" field is the sanctions regime name,
   * not a registration country, so guessing one here would be worse than
   * leaving it for another source to backfill.
   */
  async ingestCanadaSema(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Canada Consolidated Autonomous Sanctions List',
      'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/consolidated-consolide.aspx',
      'company',
    );
    const entities = await this.canadaSema.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers: [],
        sanctions: [{ regime: 'Canada', program: e.program }],
        primaryCountryId: null,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `Canada SEMA entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * Australia's DFAT Consolidated List. Same "no structured identifiers,
   * relies on fuzzy/LLM linking" shape as Canada — DFAT's own free-text
   * fields (Address, Citizenship) aren't structured registration numbers
   * the way OFAC/EU/GLEIF's are, so extracting a reg_number here would be
   * guessing rather than reading real data.
   */
  async ingestAustraliaDfat(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Australia DFAT Consolidated List',
      'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list',
      'company',
    );
    const entities = await this.australiaDfat.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers: [],
        sanctions: [{ regime: 'Australia DFAT', program: e.program }],
        primaryCountryId: null,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `Australia DFAT entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * US trade.gov Consolidated Screening List — 11 non-SDN export/sanctions
   * lists in one feed (SDN itself is excluded, see us-csl.adapter.ts).
   * Requires a user-registered TRADE_GOV_API_KEY (self-service signup,
   * same key-gated pattern as Companies House). Identifier types are
   * genuinely ambiguous free text here too (like OFSI), so the same
   * resolveIdentifierType check-before-default applies.
   */
  async ingestUsCsl(): Promise<IngestSummary> {
    if (!this.usCsl.configured) {
      throw new Error('TRADE_GOV_API_KEY is not configured');
    }
    const source = await this.getOrCreateSource(
      'US Consolidated Screening List',
      'https://developer.trade.gov/apis',
      'company',
    );
    const entities = await this.usCsl.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const identifiers = [];
      for (const id of e.identifiers) {
        const countryId = id.countryIso2 ?? '';
        const type = await this.resolution.resolveIdentifierType(id.value, countryId, ['reg_number', 'tax_id']);
        identifiers.push({ type, value: id.value, countryId });
      }
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers,
        sanctions: e.programs.map((p) => ({ regime: `US CSL (${e.sourceAbbrev})`, program: p })),
        primaryCountryId: e.countryIso2,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `US CSL entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * Estonia's e-Business Register beneficial-ownership file, filtered to
   * companies with a RU/UA/BY-resident beneficial owner (see
   * estonia-registry.adapter.ts). No sanctions payload — these companies
   * aren't themselves designated, this is an ownership-network signal, not
   * a sanctions list. Every record carries its own reg_number@EE
   * identifier, so this never reaches Phase 2/3 fuzzy or LLM matching (per
   * the existing "only fires when a record has zero identifiers" rule).
   */
  async ingestEstoniaRegistry(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Estonia e-Business Register',
      'https://avaandmed.ariregister.rik.ee/en/downloading-open-data',
      'company',
    );
    const entities = await this.estoniaRegistry.fetchBeneficialOwnershipLinkedCompanies();

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: [],
        identifiers: [{ type: 'reg_number', value: e.externalId, countryId: 'EE' }],
        primaryCountryId: 'EE',
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `Estonia registry entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * Latvia's Enterprise Register, same shape as Estonia: filtered to
   * companies with a RU/UA/BY beneficial owner, no sanctions payload (an
   * ownership-network signal, not a designation). See
   * latvia-registry.adapter.ts for the two-file join this requires.
   */
  async ingestLatviaRegistry(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Latvia Enterprise Register',
      'https://data.gov.lv/dati/eng/dataset/patiesie-labuma-guveji',
      'company',
    );
    const entities = await this.latviaRegistry.fetchBeneficialOwnershipLinkedCompanies();

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: [],
        identifiers: [{ type: 'reg_number', value: e.externalId, countryId: 'LV' }],
        primaryCountryId: 'LV',
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `Latvia registry entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * US public company registry — not scoped by country/regime like the
   * sanctions sources (it's a general identity source, ~10,400 companies),
   * no sanctions payload. CIK is globally unique so no country mapping is
   * needed either.
   */
  async ingestSecEdgar(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'SEC EDGAR',
      'https://www.sec.gov/files/company_tickers.json',
      'company',
    );
    const companies = await this.secEdgar.fetchCompanies();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const c of companies) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: c.cik,
        name: c.name,
        aliases: c.ticker ? [c.ticker] : [],
        identifiers: [{ type: 'cik' as IdentifierType, value: c.cik, countryId: '' }],
        raw: c,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: companies.length, created, merged };
    this.logger.log(
      `SEC EDGAR entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
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

  /**
   * Fetches Companies House's real beneficial-ownership data (Persons with
   * Significant Control) for an entity's known GB company number, and links
   * each active corporate-entity PSC as a parent via EntityRelationship —
   * same shape as enrichRelationshipsWithGleif. Individual-person PSCs (real
   * people) are deliberately NOT linked: Entity.entityType only supports
   * 'company', and modelling a Person is a schema decision, not something
   * to bolt on silently while adding a source. Requires the entity to
   * already carry a reg_number@GB identifier (run enrich/:id/companies-house
   * first if it doesn't have one yet).
   */
  async enrichPscWithCompaniesHouse(
    entityId: string,
  ): Promise<{ companyNumber: string | null; parentsLinked: number; individualPscsSkipped: number }> {
    if (!this.companiesHouse.configured) {
      throw new Error('COMPANIES_HOUSE_API_KEY is not configured');
    }
    const regRow = await this.prisma.entityIdentifier.findFirst({
      where: { entityId, type: 'reg_number', countryId: 'GB' },
      select: { value: true },
    });
    if (!regRow) return { companyNumber: null, parentsLinked: 0, individualPscsSkipped: 0 };

    const source = await this.getOrCreateSource(
      'UK Companies House',
      'https://api.company-information.service.gov.uk',
      'company',
    );
    const pscs = await this.companiesHouse.fetchPsc(regRow.value);

    let parentsLinked = 0;
    let individualPscsSkipped = 0;
    for (const psc of pscs) {
      if (psc.ceased) continue;
      if (psc.kind !== 'corporate-entity-person-with-significant-control') {
        individualPscsSkipped++;
        continue;
      }
      const identifiers: NormalizedEntityRecord['identifiers'] = psc.registrationNumber
        ? [{ type: 'reg_number', value: psc.registrationNumber, countryId: psc.countryIso2 ?? '' }]
        : [];
      const record: NormalizedEntityRecord = {
        sourceExternalId: `psc:${regRow.value}:${psc.name}`,
        name: psc.name,
        aliases: [],
        identifiers,
        primaryCountryId: psc.countryIso2,
        raw: psc.raw,
      };
      const { entityId: parentEntityId } = await this.resolution.resolve(record, source.id);
      if (parentEntityId === entityId) continue;
      await this.prisma.entityRelationship.upsert({
        where: { parentId_childId: { parentId: parentEntityId, childId: entityId } },
        create: { parentId: parentEntityId, childId: entityId, sourceId: source.id },
        update: {},
      });
      parentsLinked++;
    }

    return { companyNumber: regRow.value, parentsLinked, individualPscsSkipped };
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
   * On-demand enrichment against the UK company register — same shape as
   * enrichWithGleif: search is a discovery mechanism, the actual merge
   * still goes through identifier equality (company_number, scoped to GB).
   * Prefers an 'active' search hit over a dissolved one when both exist,
   * since a dissolved shell with a similar name is a common false lead.
   */
  async enrichWithCompaniesHouse(
    entityId: string,
  ): Promise<{ found: boolean; companyNumber?: string; matchedExisting?: boolean }> {
    if (!this.companiesHouse.configured) {
      throw new Error('COMPANIES_HOUSE_API_KEY is not configured');
    }
    const entity = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
    const source = await this.getOrCreateSource(
      'UK Companies House',
      'https://api.company-information.service.gov.uk',
      'company',
    );
    const results = await this.companiesHouse.searchByName(entity.canonicalName);
    if (results.length === 0) return { found: false };

    // Real bug this replaced: blindly preferring an 'active' result over a
    // 'dissolved' one picked an entirely unrelated company for "PUBLIC
    // JOINT STOCK COMPANY GAZPROM NEFT" — the genuinely correct match
    // (Gazprom Neft's own UK-registered entity) was dissolved, and CH's
    // search returns plenty of coincidentally-similar active companies
    // sharing generic boilerplate ("Public Joint Stock Company"). Score by
    // name similarity instead — status is irrelevant to "is this actually
    // the same company," only to whether it's still trading.
    const targetName = normalizeCompanyName(entity.canonicalName);
    const scored = results
      .map((r) => ({ r, score: bigramSimilarity(targetName, normalizeCompanyName(r.name)) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.companiesHouse.fetchProfile(best.r.companyNumber);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.companyNumber,
      name: profile.name,
      aliases: profile.previousNames,
      identifiers: [{ type: 'reg_number', value: profile.companyNumber, countryId: 'GB' }],
      primaryCountryId: profile.countryIso2 ?? 'GB',
      raw: profile,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, companyNumber: profile.companyNumber, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against France's open SIRENE/RNE company register
   * — same shape as enrichWithCompaniesHouse (search is discovery only, the
   * actual merge goes through identifier equality on SIREN, scoped to FR).
   * Unlike Companies House, no API key is required. Also picks the best NAME
   * match by bigram score rather than trusting registration status, for the
   * same reason recorded on enrichWithCompaniesHouse.
   *
   * Real bug found live: unlike Companies House, this registry's full-text
   * search requires near-exact token overlap — legal-form noise stripped by
   * normalizeCompanyName isn't enough on its own, since OFAC-derived
   * canonical names also carry untranslated abbreviations (e.g. "AK Alrosa
   * PAO" — "AK" is a Russian "Aktsionernaya Kompaniya" prefix, not a known
   * legal suffix) that make the API return zero results even though a clean
   * "ALROSA" record exists. Falls back through the entity's existing
   * aliases (OFAC/GLEIF already store cleaner name variants for exactly
   * this kind of case) until one search actually surfaces a real match.
   */
  async enrichWithFranceRegistry(
    entityId: string,
  ): Promise<{ found: boolean; siren?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource(
      'France SIRENE Registry',
      'https://recherche-entreprises.api.gouv.fr',
      'company',
    );
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: FranceRegistryResult; score: number } | null = null;
    for (const candidateName of candidateNames) {
      const query = normalizeCompanyName(candidateName);
      if (!query) continue;
      const results = await this.franceRegistry.searchByName(query);
      for (const r of results) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break; // strong match already — stop probing more aliases
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.franceRegistry.fetchProfile(best.r.siren);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.siren,
      name: profile.name,
      aliases: profile.sigle ? [profile.sigle] : [],
      identifiers: [{ type: 'reg_number', value: profile.siren, countryId: 'FR' }],
      primaryCountryId: profile.countryIso2 ?? 'FR',
      raw: profile,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, siren: profile.siren, matchedExisting: result.entityId === entityId };
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
