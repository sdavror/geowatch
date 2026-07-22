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
import { NorwayBrregAdapter } from './norway-brreg.adapter';
import { FinlandYtjAdapter } from './finland-ytj.adapter';
import { SwitzerlandZefixAdapter } from './switzerland-zefix.adapter';
import { SlovakiaOrsfAdapter } from './slovakia-orsf.adapter';
import { JapanMofAdapter } from './japan-mof.adapter';
import { SwitzerlandSecoAdapter } from './switzerland-seco.adapter';
import { IrelandCroAdapter, type IrelandCroResult } from './ireland-cro.adapter';
import { RomaniaAnafAdapter, normalizeRomaniaStatus } from './romania-anaf.adapter';
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
    private readonly norwayBrreg: NorwayBrregAdapter,
    private readonly finlandYtj: FinlandYtjAdapter,
    private readonly switzerlandZefix: SwitzerlandZefixAdapter,
    private readonly slovakiaOrsf: SlovakiaOrsfAdapter,
    private readonly japanMof: JapanMofAdapter,
    private readonly switzerlandSeco: SwitzerlandSecoAdapter,
    private readonly irelandCro: IrelandCroAdapter,
    private readonly romaniaAnaf: RomaniaAnafAdapter,
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
   * Japan's own sanctions program (Ministry of Finance asset-freeze list) —
   * the first sanctions source in this project from a top-economy country
   * whose OWN designations we track, rather than a copy of/overlap with US/
   * EU/UK lists. Same "no structured identifiers, relies on fuzzy/LLM
   * linking" shape as Canada/Australia — Japan's free-text address field
   * gives a real country name though, unlike those two, so primaryCountryId
   * is populated where resolvable.
   */
  async ingestJapanMof(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Japan MOF Sanctions List',
      'https://www.mof.go.jp/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html',
      'company',
    );
    const countryMap = await this.buildCountryNameMap();
    const entities = await this.japanMof.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers: [],
        sanctions: [{ regime: 'Japan MOF', program: 'asset-freeze' }],
        primaryCountryId: countryMap.get(this.normalizeCountryName(e.addressCountryName)) || null,
        raw: e.raw,
      };
      const result = await this.resolution.resolve(record, source.id, llmBudget);
      if (result.merged) merged++;
      else created++;
    }

    await this.prisma.source.update({ where: { id: source.id }, data: { lastFetched: new Date() } });
    const summary = { processed: entities.length, created, merged };
    this.logger.log(
      `Japan MOF entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
    );
    return summary;
  }

  /**
   * Switzerland's SECO consolidated sanctions list — Switzerland's own
   * sanctions program (distinct from the Zefix company-registry source
   * already in this project). Same "no structured identifiers, program
   * name is a regime not a registration country" shape as Canada/
   * Australia — primaryCountryId stays null.
   */
  async ingestSwitzerlandSeco(): Promise<IngestSummary> {
    const source = await this.getOrCreateSource(
      'Switzerland SECO Sanctions List',
      'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos.html',
      'company',
    );
    const entities = await this.switzerlandSeco.fetchEntities();
    const llmBudget: LlmBudget = { remaining: OFAC_LLM_BUDGET };

    let created = 0;
    let merged = 0;
    for (const e of entities) {
      const record: NormalizedEntityRecord = {
        sourceExternalId: e.externalId,
        name: e.name,
        aliases: e.aliases,
        identifiers: [],
        sanctions: [{ regime: 'Switzerland SECO', program: e.program }],
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
      `Switzerland SECO entity ingestion: ${summary.processed} processed → ${summary.created} new entities, ${summary.merged} matched an existing entity`,
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
        profile: { addressLine: e.addressLine, addressCity: e.addressCity, addressPostalCode: e.addressPostalCode },
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
        officers: e.owners.map((o) => ({ name: o.name, role: 'beneficial_owner' as const, countryId: o.countryIso2 })),
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
        officers: e.owners.map((o) => ({ name: o.name, role: 'beneficial_owner' as const, countryId: o.countryIso2 })),
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
   * people) are NOT linked as parent Entities — Entity.entityType only
   * supports 'company', and modelling a Person as a full cross-source
   * Entity is a bigger schema decision than adding a source. Instead they
   * become an EntityOfficer fact record (role='beneficial_owner') on this
   * entity — a per-source "who Companies House says controls this company"
   * note, not an identity-resolved person. Requires the entity to already
   * carry a reg_number@GB identifier (run enrich/:id/companies-house first
   * if it doesn't have one yet).
   */
  async enrichPscWithCompaniesHouse(
    entityId: string,
  ): Promise<{ companyNumber: string | null; parentsLinked: number; officersAdded: number }> {
    if (!this.companiesHouse.configured) {
      throw new Error('COMPANIES_HOUSE_API_KEY is not configured');
    }
    const regRow = await this.prisma.entityIdentifier.findFirst({
      where: { entityId, type: 'reg_number', countryId: 'GB' },
      select: { value: true },
    });
    if (!regRow) return { companyNumber: null, parentsLinked: 0, officersAdded: 0 };

    const source = await this.getOrCreateSource(
      'UK Companies House',
      'https://api.company-information.service.gov.uk',
      'company',
    );
    const pscs = await this.companiesHouse.fetchPsc(regRow.value);

    let parentsLinked = 0;
    let officersAdded = 0;
    for (const psc of pscs) {
      if (psc.ceased) continue;
      if (psc.kind !== 'corporate-entity-person-with-significant-control') {
        await this.prisma.entityOfficer.upsert({
          where: {
            entityId_name_role_sourceId: {
              entityId,
              name: psc.name,
              role: 'beneficial_owner',
              sourceId: source.id,
            },
          },
          create: { entityId, name: psc.name, role: 'beneficial_owner', countryId: psc.countryIso2, sourceId: source.id },
          update: {},
        });
        officersAdded++;
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

    return { companyNumber: regRow.value, parentsLinked, officersAdded };
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
      profile: {
        status: this.companiesHouse.normalizeStatus(profile.status),
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
        industryCode: profile.sicCode,
      },
      raw: profile.raw,
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
      profile: {
        status: profile.active ? 'active' : 'dissolved',
        industryCode: profile.industryCode,
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
      },
      officers: profile.directors.map((d) => ({ name: d.name, role: 'director' as const })),
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, siren: profile.siren, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Norway's Brønnøysund Register — same shape
   * as enrichWithCompaniesHouse/enrichWithFranceRegistry (search is
   * discovery only, the actual merge goes through identifier equality on
   * the org number, scoped to NO). Free and keyless, confirmed live
   * 2026-07-20. Also pulls real reported board members/daily manager via
   * the register's own `/roller` endpoint — genuine data, not modelled as
   * cross-source Person identity (same EntityOfficer fact-record approach
   * as Companies House PSC/France `dirigeants`).
   */
  async enrichWithNorwayRegistry(
    entityId: string,
  ): Promise<{ found: boolean; orgNumber?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource(
      'Norway Brønnøysund Register',
      'https://data.brreg.no/enhetsregisteret/api',
      'company',
    );
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: { orgNumber: string; name: string }; score: number } | null = null;
    for (const candidateName of candidateNames) {
      const query = normalizeCompanyName(candidateName);
      if (!query) continue;
      const results = await this.norwayBrreg.searchByName(query);
      for (const r of results) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break;
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.norwayBrreg.fetchProfile(best.r.orgNumber);
    if (!profile) return { found: false };
    const officers = await this.norwayBrreg.fetchOfficers(profile.orgNumber);

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.orgNumber,
      name: profile.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: profile.orgNumber, countryId: 'NO' }],
      primaryCountryId: 'NO',
      profile: {
        website: profile.website,
        status: profile.status,
        industryCode: profile.industryCode,
        industryLabel: profile.industryLabel,
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
      },
      officers: officers.map((o) => ({ name: o.name, role: 'officer' as const })),
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, orgNumber: profile.orgNumber, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Finland's PRH YTJ register — same shape as
   * enrichWithNorwayRegistry. Free and keyless, confirmed live 2026-07-20.
   * `status`/`tradeRegisterStatus` are undocumented numeric codes on this
   * API (no public enum found) — left unset rather than guessed, per this
   * project's convention of not inventing meanings for unclear source
   * fields (see the France/Companies House status-mapping comments for the
   * same discipline applied elsewhere). No officer/director data is
   * exposed by this API, unlike Norway's `/roller`.
   */
  async enrichWithFinlandRegistry(
    entityId: string,
  ): Promise<{ found: boolean; businessId?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource('Finland PRH YTJ Register', 'https://avoindata.prh.fi', 'company');
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: { businessId: string; name: string }; score: number } | null = null;
    for (const candidateName of candidateNames) {
      const query = normalizeCompanyName(candidateName);
      if (!query) continue;
      const results = await this.finlandYtj.searchByName(query);
      for (const r of results) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break;
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.finlandYtj.fetchProfile(best.r.businessId);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.businessId,
      name: profile.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: profile.businessId, countryId: 'FI' }],
      primaryCountryId: 'FI',
      profile: {
        website: profile.website,
        industryCode: profile.industryCode,
        industryLabel: profile.industryLabel,
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
      },
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, businessId: profile.businessId, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Switzerland's Zefix central business-name
   * index — same shape as enrichWithNorwayRegistry/enrichWithFinlandRegistry.
   * Confirmed live 2026-07-20 via the frontend's own undocumented (but
   * keyless, no-auth) API — the official documented API requires a paid
   * subscription. Deliberately sparse: Zefix is a national NAME INDEX, not
   * the full commercial register, so it has no street address, industry
   * code, website, or officer data — just UID, registered canton/commune,
   * and status. Still useful given Switzerland's relevance as a common
   * holding/trading jurisdiction for exactly the kind of company this
   * project tracks.
   */
  async enrichWithSwitzerlandRegistry(
    entityId: string,
  ): Promise<{ found: boolean; uid?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource('Switzerland Zefix', 'https://www.zefix.ch', 'company');
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: { ehraid: number; name: string }; score: number } | null = null;
    for (const candidateName of candidateNames) {
      const query = normalizeCompanyName(candidateName);
      if (!query) continue;
      const results = await this.switzerlandZefix.searchByName(query);
      for (const r of results) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break;
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.switzerlandZefix.fetchProfile(best.r.ehraid);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: String(profile.ehraid),
      name: profile.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: profile.uid, countryId: 'CH' }],
      primaryCountryId: 'CH',
      profile: { status: profile.status, addressCity: profile.addressCity },
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, uid: profile.uid, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Slovakia's ORSF register aggregator (free,
   * keyless, aggregates the official RPO/ORSR/RUZ sources) — same shape as
   * enrichWithSwitzerlandRegistry. Confirmed live 2026-07-20 with real
   * address/NACE-code/status data. Director data exists in the provider's
   * own schema but is documented as requiring authentication — left out
   * rather than reported as empty.
   */
  async enrichWithSlovakiaRegistry(
    entityId: string,
  ): Promise<{ found: boolean; ico?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource('Slovakia ORSF Register', 'https://orsf.sk', 'company');
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: { ico: string; name: string }; score: number } | null = null;
    for (const candidateName of candidateNames) {
      if (!candidateName.trim()) continue;
      // Real bug found live: unlike other countries' legal-form suffixes
      // (all covered by LEGAL_SUFFIXES), Slovak "a.s."/"s.r.o." aren't in
      // that list, so normalizeCompanyName leaves stray single-letter
      // tokens ("slovnaft a s") — ORSF's meili full-text search then
      // dilutes ranking toward OTHER companies matching "a"/"s" as their
      // own legal-form tokens, and the real match drops out of the top
      // results entirely. Query with the raw candidate name instead
      // (ORSF's own search already handles ordinary company names well);
      // normalizeCompanyName is still used for scoring the results.
      const results = await this.slovakiaOrsf.searchByName(candidateName);
      for (const r of results) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break;
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.slovakiaOrsf.fetchProfile(best.r.ico);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.ico,
      name: profile.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: profile.ico, countryId: 'SK' }],
      primaryCountryId: 'SK',
      profile: {
        status: profile.status,
        industryCode: profile.industryCode,
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
      },
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, ico: profile.ico, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Ireland's CRO open-data bulk register.
   * Unlike Companies House/France/Norway/Finland/Switzerland/Slovakia,
   * there is no live search-by-name API for this source at all — the
   * adapter's `searchByName` downloads the full daily CSV snapshot and
   * filters client-side, and each matched row already carries full profile
   * data (no separate profile-fetch round-trip needed).
   */
  async enrichWithIrelandCro(
    entityId: string,
  ): Promise<{ found: boolean; companyNumber?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource('Ireland CRO Open Data', 'https://opendata.cro.ie', 'company');
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: IrelandCroResult; score: number } | null = null;
    const results = await this.irelandCro.searchByCandidates(candidateNames);
    for (const r of results) {
      const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
      if (!best || score > best.score) best = { r, score };
    }
    if (!best || best.score < 0.5) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: best.r.companyNumber,
      name: best.r.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: best.r.companyNumber, countryId: 'IE' }],
      primaryCountryId: 'IE',
      profile: {
        status: best.r.status,
        industryCode: best.r.industryCode,
        addressLine: best.r.addressLine,
        addressPostalCode: best.r.addressPostalCode,
      },
      raw: best.r.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, companyNumber: best.r.companyNumber, matchedExisting: result.entityId === entityId };
  }

  /**
   * On-demand enrichment against Romania's ANAF/ONRC data (via the free,
   * keyless demoanaf.ro API — 4M+ companies, confirmed live 2026-07-22).
   * Genuinely rich: real reported administrators/directors, not just
   * identity fields. Two-call shape like Companies House (search, then
   * profile), but status only comes from the search hit — the profile
   * endpoint doesn't repeat it.
   */
  async enrichWithRomaniaAnaf(
    entityId: string,
  ): Promise<{ found: boolean; cui?: string; matchedExisting?: boolean }> {
    const entity = await this.prisma.entity.findUniqueOrThrow({
      where: { id: entityId },
      include: { aliases: true },
    });
    const source = await this.getOrCreateSource('Romania ANAF/ONRC', 'https://demoanaf.ro', 'company');
    const canonicalNormalized = normalizeCompanyName(entity.canonicalName);
    const candidateNames = [entity.canonicalName, ...entity.aliases.map((a) => a.name)];

    let best: { r: { cui: number; name: string; statusLabel?: string }; score: number } | null = null;
    for (const candidateName of candidateNames) {
      if (!candidateName.trim()) continue;
      const hits = await this.romaniaAnaf.searchByName(candidateName);
      for (const r of hits) {
        const score = bigramSimilarity(canonicalNormalized, normalizeCompanyName(r.name));
        if (!best || score > best.score) best = { r, score };
      }
      if (best && best.score >= 0.8) break;
    }
    if (!best || best.score < 0.5) return { found: false };

    const profile = await this.romaniaAnaf.fetchProfile(best.r.cui);
    if (!profile) return { found: false };

    const record: NormalizedEntityRecord = {
      sourceExternalId: profile.cui,
      name: profile.name,
      aliases: [],
      identifiers: [{ type: 'reg_number', value: profile.cui, countryId: 'RO' }],
      primaryCountryId: 'RO',
      profile: {
        status: normalizeRomaniaStatus(best.r.statusLabel),
        industryCode: profile.industryCode,
        addressLine: profile.addressLine,
        addressCity: profile.addressCity,
        addressPostalCode: profile.addressPostalCode,
      },
      officers: profile.administrators.map((a) => ({ name: a.name, role: 'director' as const })),
      raw: profile.raw,
    };
    const result = await this.resolution.resolve(record, source.id);
    return { found: true, cui: profile.cui, matchedExisting: result.entityId === entityId };
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

  /**
   * One-time (idempotent, safe to re-run) backfill of the Track A company-
   * profile fields for entities ingested before those fields existed. Two
   * approaches depending on what each source's already-stored rawPayload
   * actually contains:
   *  - US CSL and Estonia kept their FULL raw API/file record from the
   *    start, so this re-parses what's already in Postgres — zero new HTTP
   *    calls.
   *  - Companies House, France SIRENE, and (for officer names specifically)
   *    Latvia only ever stored a mapped subset — the on-demand
   *    enrichment/ingestion methods are simply re-run for the (small)
   *    existing entity set, using the now-extended adapters, rather than
   *    inventing a second parser for data that was never persisted.
   */
  async backfillCompanyProfile(): Promise<{
    usCsl: { scanned: number; profilesFilled: number };
    estonia: { scanned: number; officersAdded: number };
    companiesHouse: { entities: number; profilesFilled: number; officersAdded: number };
    franceRegistry: { entities: number; profilesFilled: number };
    latvia: IngestSummary;
  }> {
    const usCslSource = await this.prisma.source.findFirst({ where: { name: 'US Consolidated Screening List' } });
    let usCslScanned = 0;
    let usCslFilled = 0;
    if (usCslSource) {
      const links = await this.prisma.entitySourceLink.findMany({
        where: { sourceId: usCslSource.id },
        select: { entityId: true, rawPayload: true },
      });
      for (const link of links) {
        usCslScanned++;
        const profile = this.usCsl.extractAddressFromRaw(link.rawPayload);
        if (profile.addressLine || profile.addressCity || profile.addressPostalCode) {
          await this.resolution.fillProfileFields(link.entityId, profile);
          usCslFilled++;
        }
      }
    }

    const estoniaSource = await this.prisma.source.findFirst({ where: { name: 'Estonia e-Business Register' } });
    let estoniaScanned = 0;
    let estoniaOfficersAdded = 0;
    if (estoniaSource) {
      const links = await this.prisma.entitySourceLink.findMany({
        where: { sourceId: estoniaSource.id },
        select: { entityId: true, rawPayload: true },
      });
      for (const link of links) {
        estoniaScanned++;
        const officers = this.estoniaRegistry.extractOfficersFromRaw(link.rawPayload);
        if (officers.length) {
          estoniaOfficersAdded += await this.resolution.addOfficers(
            link.entityId,
            estoniaSource.id,
            officers.map((o) => ({ name: o.name, role: 'beneficial_owner' as const, countryId: o.countryIso2 })),
          );
        }
      }
    }

    const ghEntities = await this.prisma.entityIdentifier.findMany({
      where: { type: 'reg_number', countryId: 'GB' },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    let chProfilesFilled = 0;
    let chOfficersAdded = 0;
    for (const { entityId } of ghEntities) {
      const before = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
      await this.enrichWithCompaniesHouse(entityId).catch((err) =>
        this.logger.warn(`CH profile backfill for ${entityId} failed: ${(err as Error).message}`),
      );
      const after = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
      if (after.addressLine !== before.addressLine || after.status !== before.status) chProfilesFilled++;
      const psc = await this.enrichPscWithCompaniesHouse(entityId).catch((err) => {
        this.logger.warn(`CH PSC backfill for ${entityId} failed: ${(err as Error).message}`);
        return null;
      });
      if (psc) chOfficersAdded += psc.officersAdded;
    }

    const frEntities = await this.prisma.entityIdentifier.findMany({
      where: { type: 'reg_number', countryId: 'FR' },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    let frProfilesFilled = 0;
    for (const { entityId } of frEntities) {
      const before = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
      await this.enrichWithFranceRegistry(entityId).catch((err) =>
        this.logger.warn(`France registry backfill for ${entityId} failed: ${(err as Error).message}`),
      );
      const after = await this.prisma.entity.findUniqueOrThrow({ where: { id: entityId } });
      if (after.addressLine !== before.addressLine || after.industryCode !== before.industryCode) frProfilesFilled++;
    }

    // Latvia's stored raw never had owner names (only the register row) —
    // re-running the standard bulk ingest is cheap (two CSV downloads, not
    // per-entity calls) and idempotent, and now populates officers thanks
    // to the adapter change above.
    const latviaSummary = await this.ingestLatviaRegistry();

    const summary = {
      usCsl: { scanned: usCslScanned, profilesFilled: usCslFilled },
      estonia: { scanned: estoniaScanned, officersAdded: estoniaOfficersAdded },
      companiesHouse: { entities: ghEntities.length, profilesFilled: chProfilesFilled, officersAdded: chOfficersAdded },
      franceRegistry: { entities: frEntities.length, profilesFilled: frProfilesFilled },
      latvia: latviaSummary,
    };
    this.logger.log(`Company-profile backfill complete: ${JSON.stringify(summary)}`);
    return summary;
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
