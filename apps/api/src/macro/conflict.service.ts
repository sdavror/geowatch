import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UcdpAdapter, type UcdpEvent } from './ucdp.adapter';

// How far back the rolling window reaches. 15 months: enough for a
// year-over-year trend plus the current partial year from candidate data.
const WINDOW_MONTHS = 15;

// UCDP uses Gleditsch-Ward country naming; where it diverges from our
// Country.name, map explicitly. Unmatched names are logged and skipped —
// a silent wrong-country attribution is worse than a gap.
const UCDP_NAME_TO_ISO2: Record<string, string> = {
  'Russia (Soviet Union)': 'RU',
  'DR Congo (Zaire)': 'CD',
  'Myanmar (Burma)': 'MM',
  'Yemen (North Yemen)': 'YE',
  'Cambodia (Kampuchea)': 'KH',
  'Zimbabwe (Rhodesia)': 'ZW',
  'Serbia (Yugoslavia)': 'RS',
  'Bosnia-Herzegovina': 'BA',
  'United States of America': 'US',
  'Ivory Coast': 'CI',
  'Kingdom of eSwatini (Swaziland)': 'SZ',
  'Macedonia, FYR': 'MK',
  'Vietnam (North Vietnam)': 'VN',
  'Madagascar (Malagasy)': 'MG',
  'Turkey': 'TR',
  'Czech Republic': 'CZ',
  'East Timor': 'TL',
  'Congo': 'CG',
  'Laos': 'LA',
};

interface Bucket {
  events: number;
  deaths: number;
  stateBased: number;
  nonState: number;
  oneSided: number;
}

/**
 * Conflict-intensity layer over UCDP GED: aggregates events into per-country
 * monthly rows and serves trend series. Weekly cron — GED candidate data
 * updates monthly, so weekly is already generous.
 */
@Injectable()
export class ConflictService {
  private readonly logger = new Logger(ConflictService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ucdp: UcdpAdapter,
  ) {}

  @Cron('0 0 5 * * 1') // Mondays 05:00 UTC
  async scheduledRefresh() {
    if (!this.ucdp.configured) return;
    try {
      await this.refresh();
    } catch (err) {
      this.logger.error(`Scheduled conflict refresh failed: ${(err as Error).message}`);
    }
  }

  async refresh() {
    if (!this.ucdp.configured) {
      throw new ServiceUnavailableException('UCDP_API_TOKEN is not configured');
    }

    const from = new Date();
    from.setUTCMonth(from.getUTCMonth() - WINDOW_MONTHS, 1);
    from.setUTCHours(0, 0, 0, 0);
    const startDate = from.toISOString().slice(0, 10);

    const { events, sources } = await this.ucdp.fetchWindow(startDate);

    // Country-name resolution: exact (case-insensitive) DB name first, then
    // the alias table. Track misses for the summary.
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
    const byName = new Map(countries.map((c) => [c.name.toLowerCase(), c.id]));
    const validIds = new Set(countries.map((c) => c.id));
    const unmatched = new Map<string, number>();

    const buckets = new Map<string, Bucket>(); // "ISO2|2026-05-01"
    for (const e of events) {
      if (e.dateStart < startDate) continue; // candidate sets aren't date-filtered
      const iso =
        byName.get(e.country.toLowerCase()) ??
        (UCDP_NAME_TO_ISO2[e.country] && validIds.has(UCDP_NAME_TO_ISO2[e.country])
          ? UCDP_NAME_TO_ISO2[e.country]
          : undefined);
      if (!iso) {
        unmatched.set(e.country, (unmatched.get(e.country) ?? 0) + 1);
        continue;
      }
      const month = `${e.dateStart.slice(0, 7)}-01`;
      const key = `${iso}|${month}`;
      const b = buckets.get(key) ?? { events: 0, deaths: 0, stateBased: 0, nonState: 0, oneSided: 0 };
      b.events++;
      b.deaths += e.deaths;
      if (e.typeOfViolence === 1) b.stateBased++;
      else if (e.typeOfViolence === 2) b.nonState++;
      else b.oneSided++;
      buckets.set(key, b);
    }

    // Replace the whole window atomically — months get restated when
    // candidate data is superseded by the final release.
    const rows = [...buckets.entries()].map(([key, b]) => {
      const [countryId, month] = key.split('|');
      return { countryId, month: new Date(`${month}T00:00:00Z`), ...b };
    });
    await this.prisma.$transaction([
      this.prisma.conflictMonth.deleteMany({ where: { month: { gte: from } } }),
      this.prisma.conflictMonth.createMany({ data: rows }),
    ]);

    for (const [name, count] of unmatched) {
      this.logger.warn(`Unmatched UCDP country "${name}" (${count} events) — skipped`);
    }
    this.logger.log(
      `Conflict refresh: ${events.length} events → ${rows.length} country-months from GED [${sources.join(', ')}]`,
    );
    return {
      events: events.length,
      countryMonths: rows.length,
      countriesCovered: new Set(rows.map((r) => r.countryId)).size,
      datasets: sources,
      unmatchedNames: [...unmatched.keys()],
    };
  }

  /**
   * Trailing-12m event/death totals for every country with any recorded
   * conflict activity, in one query — powers the map's conflict-intensity
   * layer (a per-country /conflict/:id call for all ~200 countries would be
   * needlessly chatty when the map just needs a single choropleth pass).
   */
  async summary() {
    const rows = await this.prisma.conflictMonth.findMany({
      where: { month: { gte: new Date(Date.now() - 366 * 86400_000) } },
    });
    const byCountry = new Map<string, { events: number; deaths: number }>();
    for (const r of rows) {
      const acc = byCountry.get(r.countryId) ?? { events: 0, deaths: 0 };
      acc.events += r.events;
      acc.deaths += r.deaths;
      byCountry.set(r.countryId, acc);
    }
    return [...byCountry.entries()].map(([countryId, totals]) => ({ countryId, ...totals }));
  }

  /** Monthly series + trailing totals for one country — public endpoint + analysis context. */
  async forCountry(countryId: string) {
    const id = countryId.toUpperCase();
    const rows = await this.prisma.conflictMonth.findMany({
      where: { countryId: id },
      orderBy: { month: 'asc' },
    });
    const last12 = rows.filter(
      (r) => r.month.getTime() >= Date.now() - 366 * 86400_000,
    );
    return {
      countryId: id,
      months: rows.map((r) => ({
        month: r.month.toISOString().slice(0, 10),
        events: r.events,
        deaths: r.deaths,
        stateBased: r.stateBased,
        nonState: r.nonState,
        oneSided: r.oneSided,
      })),
      trailing12m: {
        events: last12.reduce((s, r) => s + r.events, 0),
        deaths: last12.reduce((s, r) => s + r.deaths, 0),
      },
    };
  }
}
