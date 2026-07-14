import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ComtradeAdapter } from './comtrade.adapter';

// "Who matters to whom" needs each country's handful of dominant partners,
// not the full bilateral matrix — 15 covers every economy's meaningful
// concentration while keeping the table ~200×2×15 rows.
const TOP_PARTNERS_PER_FLOW = 15;

export interface TradeRefreshSummary {
  countriesAttempted: number;
  countriesUpdated: number;
  rowsUpserted: number;
  errors: string[];
}

@Injectable()
export class TradeService {
  private readonly logger = new Logger(TradeService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly comtrade: ComtradeAdapter,
  ) {}

  /**
   * Weekly, Sunday 05:00 — Comtrade data is annual with country-specific
   * reporting lags, so weekly is already generous; the run is slow by
   * design (rate-limit pacing) and belongs in off-peak hours.
   */
  @Cron('0 0 5 * * 0')
  async scheduledRefresh() {
    await this.refreshAll();
  }

  async refreshAll(): Promise<TradeRefreshSummary> {
    if (this.running) {
      this.logger.warn('Trade refresh already in progress, skipping this trigger');
      return { countriesAttempted: 0, countriesUpdated: 0, rowsUpserted: 0, errors: ['already running'] };
    }
    this.running = true;
    const summary: TradeRefreshSummary = { countriesAttempted: 0, countriesUpdated: 0, rowsUpserted: 0, errors: [] };
    try {
      const countries = await this.prisma.country.findMany({ select: { id: true } });
      for (const { id } of countries) {
        if (!(await this.comtrade.hasReporterCode(id))) continue;
        summary.countriesAttempted++;
        try {
          const rows = await this.refreshCountry(id);
          if (rows > 0) summary.countriesUpdated++;
          summary.rowsUpserted += rows;
        } catch (err) {
          const msg = `Trade refresh failed for ${id}: ${err instanceof Error ? err.message : err}`;
          this.logger.warn(msg);
          summary.errors.push(msg);
          // A 429 means the whole run is throttled — pushing on would just
          // burn the remaining countries' attempts.
          if (msg.includes('429')) break;
        }
      }
      this.logger.log(
        `✅ Trade refresh: ${summary.countriesUpdated}/${summary.countriesAttempted} countries, ` +
          `${summary.rowsUpserted} rows, ${summary.errors.length} errors`,
      );
      return summary;
    } finally {
      this.running = false;
    }
  }

  /** Fetch and upsert one reporter's top partners; returns rows written. */
  async refreshCountry(iso2: string): Promise<number> {
    const id = iso2.toUpperCase();
    const flows = await this.comtrade.fetchTopPartners(id, TOP_PARTNERS_PER_FLOW);
    // Partners must exist in our countries table for the FK — Comtrade codes
    // cover a few entities we don't track.
    const known = new Set(
      (await this.prisma.country.findMany({ select: { id: true } })).map((c) => c.id),
    );
    let written = 0;
    for (const f of flows) {
      if (!known.has(f.partnerIso2)) continue;
      await this.prisma.tradeFlow.upsert({
        where: {
          reporterId_partnerId_flow_year: {
            reporterId: id,
            partnerId: f.partnerIso2,
            flow: f.flow,
            year: f.year,
          },
        },
        create: { reporterId: id, partnerId: f.partnerIso2, flow: f.flow, year: f.year, valueUsd: f.valueUsd },
        update: { valueUsd: f.valueUsd },
      });
      written++;
    }
    return written;
  }

  /** Latest-year top partners for one country, both flows, partner names resolved. */
  async topPartners(iso2: string, topN = TOP_PARTNERS_PER_FLOW) {
    const id = iso2.toUpperCase();
    const latest = await this.prisma.tradeFlow.findFirst({
      where: { reporterId: id },
      orderBy: { year: 'desc' },
      select: { year: true },
    });
    if (!latest) return { countryId: id, year: null, exports: [], imports: [] };

    const rows = await this.prisma.tradeFlow.findMany({
      where: { reporterId: id, year: latest.year },
      orderBy: { valueUsd: 'desc' },
      include: { partner: { select: { id: true, name: true, flagEmoji: true } } },
    });
    const shape = (flow: 'X' | 'M') =>
      rows
        .filter((r) => r.flow === flow)
        .slice(0, topN)
        .map((r) => ({
          partnerId: r.partner.id,
          partnerName: r.partner.name,
          flagEmoji: r.partner.flagEmoji,
          valueUsd: Number(r.valueUsd),
        }));
    return { countryId: id, year: latest.year, exports: shape('X'), imports: shape('M') };
  }
}
