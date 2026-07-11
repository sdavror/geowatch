import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CountryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';

// World Bank indicators. One request per indicator with country=all returns
// every country's series for the requested year range — no key needed.
// https://datahelpdesk.worldbank.org/knowledgebase
const WB_API_BASE = 'https://api.worldbank.org/v2/country/all/indicator';
const INDICATOR_GDP_NOMINAL = 'NY.GDP.MKTP.CD'; // current US$ — display figure
const INDICATOR_GDP_REAL = 'NY.GDP.MKTP.KD'; // constant 2015 US$ — classification
const INDICATOR_POPULATION = 'SP.POP.TOTL';

// We fetch a 12-year window because World Bank data lags 1–2 years behind
// the calendar, then classify on the latest 10 available points.
const FETCH_WINDOW_YEARS = 12;
const TREND_POINTS = 10;
// Below this many data points the trend is too noisy to classify — the
// country keeps whatever status it already has.
const MIN_POINTS = 6;

const LAST_REFRESH_KEY = 'gdp:last-refresh';
// How often the staleness check runs. The actual refresh cadence is
// GDP_REFRESH_HOURS (default 24h) — this just re-checks it, so a restart
// or a missed tick never postpones the refresh by more than an hour.
const STALE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface WorldBankRow {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

interface SeriesPoint {
  year: number;
  value: number;
}

export interface GdpRefreshSummary {
  countriesWithData: number;
  gdpRowsUpserted: number;
  populationRowsUpserted: number;
  statusesUpdated: number;
  skippedCurated: number;
}

@Injectable()
export class GdpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GdpService.name);
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Kick off in the background — never block app startup on an external API.
    void this.refreshIfStale();
    this.staleCheckTimer = setInterval(
      () => void this.refreshIfStale(),
      STALE_CHECK_INTERVAL_MS,
    );
    this.staleCheckTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.staleCheckTimer) clearInterval(this.staleCheckTimer);
  }

  /** GET /countries/:id/gdp-history */
  async getGdpHistory(id: string) {
    const normalizedId = await this.assertCountryExists(id);
    const rows = await this.prisma.gdpHistory.findMany({
      where: { countryId: normalizedId },
      orderBy: { year: 'asc' },
    });
    return rows.map((r) => ({
      countryId: r.countryId,
      year: r.year,
      gdpUsd: Number(r.gdpUsd),
      gdpConstUsd: r.gdpConstUsd !== null ? Number(r.gdpConstUsd) : null,
    }));
  }

  /** GET /countries/:id/population-history */
  async getPopulationHistory(id: string) {
    const normalizedId = await this.assertCountryExists(id);
    const rows = await this.prisma.populationHistory.findMany({
      where: { countryId: normalizedId },
      orderBy: { year: 'asc' },
    });
    return rows.map((r) => ({
      countryId: r.countryId,
      year: r.year,
      population: Number(r.population),
    }));
  }

  private async assertCountryExists(id: string): Promise<string> {
    const normalizedId = id.toUpperCase();
    const exists = await this.prisma.country.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Country with id "${id}" not found`);
    }
    return normalizedId;
  }

  private refreshIntervalMs(): number {
    const hours = Number(this.config.get('GDP_REFRESH_HOURS', '24')) || 24;
    return hours * 60 * 60 * 1000;
  }

  async refreshIfStale(): Promise<void> {
    try {
      const last = await this.redis.get<number>(LAST_REFRESH_KEY);
      if (last && Date.now() - last < this.refreshIntervalMs()) return;
      await this.refreshAll();
    } catch (err) {
      this.logger.error(
        `GDP refresh failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Fetches nominal GDP, real GDP (constant 2015 US$), and population for
   * every country from the World Bank, stores the series, refreshes the
   * headline Country.gdpUsd / Country.population values, and re-derives
   * status/riskScore from the 10-year REAL GDP trend for every country that
   * is not manually curated (statusOverride) and not in conflict — armed
   * conflict is a political fact GDP numbers cannot see.
   *
   * Real GDP is used for classification because nominal current-US$ series
   * absorb exchange-rate swings: a currency devaluation (Canada 2015,
   * Japan 2022) looks like a recession in nominal data even when the real
   * economy kept growing.
   */
  async refreshAll(): Promise<GdpRefreshSummary> {
    if (this.refreshing) {
      this.logger.warn('GDP refresh already in progress, skipping');
      return {
        countriesWithData: 0,
        gdpRowsUpserted: 0,
        populationRowsUpserted: 0,
        statusesUpdated: 0,
        skippedCurated: 0,
      };
    }
    this.refreshing = true;
    try {
      const summary = await this.doRefresh();
      await this.redis.set(LAST_REFRESH_KEY, Date.now());
      // Country payloads (status, riskScore, gdpUsd, population) changed.
      await this.redis.delByPattern('countries:*');
      this.logger.log(
        `✅ GDP refresh: ${summary.countriesWithData} countries, ` +
          `${summary.gdpRowsUpserted} gdp rows, ` +
          `${summary.populationRowsUpserted} population rows, ` +
          `${summary.statusesUpdated} statuses updated, ` +
          `${summary.skippedCurated} curated/conflict skipped`,
      );
      return summary;
    } finally {
      this.refreshing = false;
    }
  }

  private async doRefresh(): Promise<GdpRefreshSummary> {
    const [nominalByCountry, realByCountry, populationByCountry] =
      await Promise.all([
        this.fetchWorldBankSeries(INDICATOR_GDP_NOMINAL),
        this.fetchWorldBankSeries(INDICATOR_GDP_REAL),
        this.fetchWorldBankSeries(INDICATOR_POPULATION),
      ]);

    const countries = await this.prisma.country.findMany({
      select: { id: true, status: true, statusOverride: true },
    });

    const summary: GdpRefreshSummary = {
      countriesWithData: 0,
      gdpRowsUpserted: 0,
      populationRowsUpserted: 0,
      statusesUpdated: 0,
      skippedCurated: 0,
    };

    for (const country of countries) {
      const nominal = nominalByCountry.get(country.id) ?? [];
      const real = realByCountry.get(country.id) ?? [];
      const population = populationByCountry.get(country.id) ?? [];
      if (nominal.length === 0 && population.length === 0) continue;
      summary.countriesWithData++;

      const realByYear = new Map(real.map((p) => [p.year, p.value]));
      for (const point of nominal) {
        const constUsd = realByYear.get(point.year);
        await this.prisma.gdpHistory.upsert({
          where: {
            countryId_year: { countryId: country.id, year: point.year },
          },
          update: {
            gdpUsd: BigInt(Math.round(point.value)),
            gdpConstUsd:
              constUsd !== undefined ? BigInt(Math.round(constUsd)) : null,
          },
          create: {
            countryId: country.id,
            year: point.year,
            gdpUsd: BigInt(Math.round(point.value)),
            gdpConstUsd:
              constUsd !== undefined ? BigInt(Math.round(constUsd)) : null,
          },
        });
        summary.gdpRowsUpserted++;
      }

      for (const point of population) {
        await this.prisma.populationHistory.upsert({
          where: {
            countryId_year: { countryId: country.id, year: point.year },
          },
          update: { population: BigInt(Math.round(point.value)) },
          create: {
            countryId: country.id,
            year: point.year,
            population: BigInt(Math.round(point.value)),
          },
        });
        summary.populationRowsUpserted++;
      }

      // Prefer the FX-noise-free real series for classification; fall back
      // to nominal (with its stricter volatility interpretation) only when
      // the country doesn't report constant-dollar GDP.
      const classified =
        this.classify(real, 'real') ?? this.classify(nominal, 'nominal');

      // Curated countries keep their status: manual overrides always win,
      // and conflict is decided by analysts, not by GDP arithmetic.
      const curated = country.statusOverride || country.status === 'conflict';
      if (curated) summary.skippedCurated++;

      const headline: {
        gdpUsd?: bigint;
        population?: bigint;
        status?: CountryStatus;
        riskScore?: number;
      } = {};
      if (nominal.length > 0) {
        headline.gdpUsd = BigInt(Math.round(nominal[nominal.length - 1].value));
      }
      if (population.length > 0) {
        headline.population = BigInt(
          Math.round(population[population.length - 1].value),
        );
      }
      if (!curated && classified) {
        headline.status = classified.status;
        headline.riskScore = classified.score;
      }

      await this.prisma.country.update({
        where: { id: country.id },
        data: headline,
      });

      if (!curated && classified) {
        await this.prisma.riskScoreHistory.create({
          data: {
            countryId: country.id,
            score: classified.score,
            breakdown: { economic: classified.score },
          },
        });
        summary.statusesUpdated++;
      }
    }

    return summary;
  }

  private async fetchWorldBankSeries(
    indicator: string,
  ): Promise<Map<string, SeriesPoint[]>> {
    const endYear = new Date().getFullYear();
    const startYear = endYear - FETCH_WINDOW_YEARS;
    const url = `${WB_API_BASE}/${indicator}?format=json&per_page=20000&date=${startYear}:${endYear}`;

    this.logger.log(`Fetching World Bank ${indicator} ${startYear}–${endYear}...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`World Bank API responded ${res.status} for ${indicator}`);
    }
    const payload = (await res.json()) as [unknown, WorldBankRow[] | null];
    const rows = payload?.[1];
    if (!Array.isArray(rows)) {
      throw new Error(
        `World Bank API returned an unexpected payload shape for ${indicator}`,
      );
    }

    // country.id in indicator responses is the ISO 3166-1 alpha-2 code —
    // the same key our countries table uses. Aggregates (regions, income
    // groups) also appear in the feed; they simply won't match any country
    // row, so no explicit filtering is needed beyond the DB lookup.
    const byCountry = new Map<string, SeriesPoint[]>();
    for (const row of rows) {
      if (row.value === null || row.value === undefined) continue;
      const iso2 = row.country?.id;
      const year = Number(row.date);
      if (!iso2 || iso2.length !== 2 || !Number.isFinite(year)) continue;
      let series = byCountry.get(iso2);
      if (!series) {
        series = [];
        byCountry.set(iso2, series);
      }
      series.push({ year, value: row.value });
    }
    for (const series of byCountry.values()) {
      series.sort((a, b) => a.year - b.year);
    }
    return byCountry;
  }

  /**
   * Derives an economic risk score (0.5–7.4) and status from the last
   * TREND_POINTS years of GDP:
   * - base score from 10-year CAGR (strong growth → low risk),
   * - penalty for volatility (std dev of YoY changes),
   * - penalty for a recent drop (last YoY change).
   *
   * Thresholds differ by mode: real (constant-dollar) growth of 1–3% is
   * normal for developed economies, while nominal current-US$ series run
   * hotter and noisier (inflation + FX), so they use the wider bands.
   * The score is capped below 7.5 on purpose: the 'conflict' band of
   * riskScoreToStatus is reserved for curated assessments.
   */
  private classify(
    series: SeriesPoint[],
    mode: 'real' | 'nominal',
  ): { score: number; status: CountryStatus } | null {
    const pts = series.slice(-TREND_POINTS);
    if (pts.length < MIN_POINTS) return null;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const years = last.year - first.year;
    if (first.value <= 0 || years <= 0) return null;

    const cagr = Math.pow(last.value / first.value, 1 / years) - 1;

    const yoy: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      yoy.push(pts[i].value / pts[i - 1].value - 1);
    }
    const mean = yoy.reduce((s, v) => s + v, 0) / yoy.length;
    const volatility = Math.sqrt(
      yoy.reduce((s, v) => s + (v - mean) ** 2, 0) / yoy.length,
    );
    const lastYoy = yoy[yoy.length - 1];

    let score: number;
    if (mode === 'real') {
      if (cagr >= 0.045) score = 1.5;
      else if (cagr >= 0.02) score = 2.2;
      else if (cagr >= 0.01) score = 2.8;
      else if (cagr >= 0) score = 4.0;
      else if (cagr >= -0.015) score = 6.0;
      else score = 7.0;

      if (volatility > 0.08) score += 1.0;
      else if (volatility > 0.05) score += 0.5;

      if (lastYoy < -0.04) score += 1.0;
      else if (lastYoy < -0.015) score += 0.5;
    } else {
      if (cagr >= 0.05) score = 1.5;
      else if (cagr >= 0.03) score = 2.5;
      else if (cagr >= 0.015) score = 3.5;
      else if (cagr >= 0) score = 5.0;
      else if (cagr >= -0.02) score = 6.0;
      else score = 7.0;

      if (volatility > 0.1) score += 1.0;
      else if (volatility > 0.06) score += 0.5;

      if (lastYoy < -0.05) score += 1.0;
      else if (lastYoy < -0.02) score += 0.5;
    }

    score = Math.min(7.4, Math.max(0.5, Math.round(score * 10) / 10));

    // Same thresholds as riskScoreToStatus in shared-types; 'conflict'
    // (>= 7.5) is unreachable here by construction.
    const status: CountryStatus =
      score >= 5.5 ? 'crisis' : score >= 3.0 ? 'unstable' : 'stable';

    return { score, status };
  }
}
