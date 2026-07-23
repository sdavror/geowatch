import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { WorldBankAdapter, WORLD_BANK_INDICATORS } from './worldbank.adapter';
import { ImfWeoAdapter, IMF_WEO_INDICATORS } from './imf-weo.adapter';
import { OpenSanctionsAdapter } from './opensanctions.adapter';
import {
  computeCountryHealth,
  COUNTRY_HEALTH_COMPONENTS,
  COUNTRY_HEALTH_METHODOLOGY,
} from './scoring.util';

export interface MacroRefreshSummary {
  worldBankRows: number;
  imfRows: number;
  sanctionRows: number;
  countriesScored: number;
  errors: string[];
}

@Injectable()
export class MacroService implements OnModuleInit {
  private readonly logger = new Logger(MacroService.name);
  private refreshing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly worldBank: WorldBankAdapter,
    private readonly imfWeo: ImfWeoAdapter,
    private readonly openSanctions: OpenSanctionsAdapter,
  ) {}

  onModuleInit() {
    // Background — this hits several external APIs sequentially and can
    // take minutes; never block app startup on it.
    void this.refreshAll();
  }

  /** Once daily at 06:00 — matches the source data's own update cadence (daily/monthly), no need for finer granularity. */
  @Cron('0 0 6 * * *')
  async scheduledRefresh() {
    await this.refreshAll();
  }

  async refreshAll(): Promise<MacroRefreshSummary> {
    if (this.refreshing) {
      this.logger.warn('Macro refresh already in progress, skipping this trigger');
      return { worldBankRows: 0, imfRows: 0, sanctionRows: 0, countriesScored: 0, errors: ['already running'] };
    }
    this.refreshing = true;
    const summary: MacroRefreshSummary = {
      worldBankRows: 0,
      imfRows: 0,
      sanctionRows: 0,
      countriesScored: 0,
      errors: [],
    };
    try {
      try {
        summary.worldBankRows = await this.refreshWorldBank();
      } catch (err) {
        this.logAndCollect(summary, 'World Bank', err);
      }
      try {
        summary.imfRows = await this.refreshImfWeo();
      } catch (err) {
        this.logAndCollect(summary, 'IMF WEO', err);
      }
      try {
        summary.sanctionRows = await this.refreshSanctions();
      } catch (err) {
        this.logAndCollect(summary, 'OpenSanctions', err);
      }
      try {
        summary.countriesScored = await this.computeScores();
      } catch (err) {
        this.logAndCollect(summary, 'scoring', err);
      }

      await this.redis.delByPattern('macro:*');
      this.logger.log(
        `✅ Macro refresh: ${summary.worldBankRows} WB rows, ${summary.imfRows} IMF rows, ` +
          `${summary.sanctionRows} sanction rows, ${summary.countriesScored} countries scored, ` +
          `${summary.errors.length} errors`,
      );
      return summary;
    } finally {
      this.refreshing = false;
    }
  }

  private logAndCollect(summary: MacroRefreshSummary, label: string, err: unknown) {
    const msg = `${label} failed: ${err instanceof Error ? err.message : err}`;
    this.logger.error(msg);
    summary.errors.push(msg);
  }

  private async refreshWorldBank(): Promise<number> {
    const countryIds = new Set((await this.prisma.country.findMany({ select: { id: true } })).map((c) => c.id));
    let total = 0;

    // Each indicator is its own try/catch — the World Bank API occasionally
    // 400s on an individual indicator request (observed in practice), and
    // one bad indicator shouldn't take down the other eight.
    for (const [wbCode, meta] of Object.entries(WORLD_BANK_INDICATORS)) {
      try {
        const points = await this.worldBank.fetchIndicatorSeries(wbCode);
        const indicatorCode = `WB:${wbCode}`;
        const iso3ByIso2 = new Map<string, string>();

        for (const p of points) {
          if (!countryIds.has(p.iso2)) continue;
          iso3ByIso2.set(p.iso2, p.iso3);
          await this.prisma.economicIndicator.upsert({
            where: { countryId_indicatorCode_period: { countryId: p.iso2, indicatorCode, period: new Date(p.year, 0, 1) } },
            update: { value: p.value },
            create: {
              countryId: p.iso2,
              indicatorCode,
              source: 'worldbank',
              period: new Date(p.year, 0, 1),
              value: p.value,
              isForecast: false,
            },
          });
          total++;
        }
        await this.backfillIso3(iso3ByIso2);
        this.logger.log(`  WB:${wbCode} (${meta.name}): ${points.length} points`);
      } catch (err) {
        this.logger.error(`  WB:${wbCode} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    return total;
  }

  /** Fills Country.iso3 for any country still missing it — static reference data, cheap to skip once set. */
  private async backfillIso3(iso3ByIso2: Map<string, string>) {
    const missing = await this.prisma.country.findMany({ where: { iso3: null }, select: { id: true } });
    if (missing.length === 0) return;
    for (const { id } of missing) {
      const iso3 = iso3ByIso2.get(id);
      if (iso3) await this.prisma.country.update({ where: { id }, data: { iso3 } });
    }
  }

  private async refreshImfWeo(): Promise<number> {
    const countries = await this.prisma.country.findMany({ where: { iso3: { not: null } }, select: { id: true, iso3: true } });
    const countryIdByIso3 = new Map(countries.map((c) => [c.iso3 as string, c.id]));
    let total = 0;

    for (const [weoCode, meta] of Object.entries(IMF_WEO_INDICATORS)) {
      try {
        const points = await this.imfWeo.fetchIndicatorSeries(weoCode);
        const indicatorCode = `IMF:${weoCode}`;

        for (const p of points) {
          const countryId = countryIdByIso3.get(p.iso3);
          if (!countryId) continue;
          await this.prisma.economicIndicator.upsert({
            where: { countryId_indicatorCode_period: { countryId, indicatorCode, period: new Date(p.year, 0, 1) } },
            update: { value: p.value, isForecast: p.isForecast },
            create: {
              countryId,
              indicatorCode,
              source: 'imf_weo',
              period: new Date(p.year, 0, 1),
              value: p.value,
              isForecast: p.isForecast,
            },
          });
          total++;
        }
        this.logger.log(`  IMF:${weoCode} (${meta.name}): ${points.length} points`);
      } catch (err) {
        this.logger.error(`  IMF:${weoCode} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    return total;
  }

  private async refreshSanctions(): Promise<number> {
    const countryIds = new Set((await this.prisma.country.findMany({ select: { id: true } })).map((c) => c.id));
    const counts = await this.openSanctions.fetchCountryCounts();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let total = 0;

    for (const { iso2, count } of counts) {
      if (!countryIds.has(iso2)) continue;
      await this.prisma.sanctionRecord.upsert({
        where: { countryId_program_asOf: { countryId: iso2, program: 'opensanctions:all', asOf: today } },
        update: { entityCount: count },
        create: { countryId: iso2, program: 'opensanctions:all', entityCount: count, asOf: today },
      });
      total++;
    }
    this.logger.log(`  OpenSanctions: ${total} countries`);
    return total;
  }

  private async computeScores(): Promise<number> {
    const period = new Date();
    period.setDate(1);
    period.setHours(0, 0, 0, 0);

    const latestByIndicator = new Map<string, Map<string, number>>();
    for (const { code } of COUNTRY_HEALTH_COMPONENTS) {
      const rows = await this.prisma.economicIndicator.findMany({
        where: { indicatorCode: code },
        orderBy: { period: 'desc' },
        distinct: ['countryId'],
      });
      latestByIndicator.set(code, new Map(rows.map((r) => [r.countryId, Number(r.value)])));
    }

    const latestSanctions = await this.prisma.sanctionRecord.findMany({
      where: { program: 'opensanctions:all' },
      orderBy: { asOf: 'desc' },
      distinct: ['countryId'],
    });
    const sanctionCounts = new Map(latestSanctions.map((s) => [s.countryId, s.entityCount]));

    const results = computeCountryHealth(latestByIndicator, sanctionCounts);
    const entityExposure = await this.computeSanctionedEntityExposure();

    for (const r of results) {
      // Informational only — deliberately NOT folded into weightedSum/value
      // above (that would double-count "sanctions pressure" against the
      // pre-existing OpenSanctions-aggregate component, and this project's
      // scoring methodology is versioned/deliberate about changes like
      // that). A real signal from the Entity Resolution engine's own
      // per-entity data, exposed alongside the score rather than baked
      // into it, same way a client already reads other component keys.
      const exposure = entityExposure.get(r.countryId);
      const components =
        exposure !== undefined ? { ...r.components, sanctionedEntityCount: exposure } : r.components;

      await this.prisma.countryHealthScore.upsert({
        where: {
          countryId_scoreName_methodology_period: {
            countryId: r.countryId,
            scoreName: 'country_health',
            methodology: COUNTRY_HEALTH_METHODOLOGY,
            period,
          },
        },
        update: { value: r.value, components },
        create: {
          countryId: r.countryId,
          scoreName: 'country_health',
          methodology: COUNTRY_HEALTH_METHODOLOGY,
          period,
          value: r.value,
          components,
        },
      });
    }
    return results.length;
  }

  /**
   * Count of sanctioned Entities per country, from the Entity Resolution
   * engine's own per-entity data (Entity.primaryCountryId + EntitySanction)
   * — distinct from the OpenSanctions-aggregate SanctionRecord pipeline
   * already feeding the composite score above. Only covers countries that
   * also get a scored CountryHealthScore row this run (see computeScores);
   * a country with real entity exposure but insufficient macro-indicator
   * coverage to be scored at all won't get this attached anywhere yet.
   */
  private async computeSanctionedEntityExposure(): Promise<Map<string, number>> {
    const sanctioned = await this.prisma.entity.findMany({
      where: { primaryCountryId: { not: null }, sanctions: { some: {} } },
      select: { primaryCountryId: true },
    });
    const counts = new Map<string, number>();
    for (const e of sanctioned) {
      const id = e.primaryCountryId as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }
}
