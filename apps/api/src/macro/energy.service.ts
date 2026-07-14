import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EiaAdapter, EIA_SERIES } from './eia.adapter';

export interface EnergyBenchmark {
  series: string;
  name: string;
  latestPeriod: string; // YYYY-MM-DD
  value: number;
  units: string;
  change30dPct: number | null;
}

@Injectable()
export class EnergyService {
  private readonly logger = new Logger(EnergyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eia: EiaAdapter,
  ) {}

  /** Daily 05:30 — EIA spot series update once per business day. */
  @Cron('0 30 5 * * *')
  async scheduledRefresh() {
    if (!this.eia.isEnabled()) return;
    await this.refreshAll();
  }

  async refreshAll(): Promise<{ seriesRefreshed: number; rowsUpserted: number; errors: string[] }> {
    const summary = { seriesRefreshed: 0, rowsUpserted: 0, errors: [] as string[] };
    if (!this.eia.isEnabled()) {
      summary.errors.push('EIA_API_KEY not configured');
      return summary;
    }
    for (const seriesId of Object.keys(EIA_SERIES)) {
      try {
        const points = await this.eia.fetchSeries(seriesId);
        for (const p of points) {
          await this.prisma.energyPrice.upsert({
            where: { series_period: { series: p.series, period: p.period } },
            create: { series: p.series, period: p.period, value: p.value, units: p.units },
            update: { value: p.value },
          });
        }
        summary.seriesRefreshed++;
        summary.rowsUpserted += points.length;
      } catch (err) {
        const msg = `EIA refresh failed for ${seriesId}: ${err instanceof Error ? err.message : err}`;
        this.logger.warn(msg);
        summary.errors.push(msg);
      }
    }
    this.logger.log(
      `✅ Energy refresh: ${summary.seriesRefreshed} series, ${summary.rowsUpserted} rows, ${summary.errors.length} errors`,
    );
    return summary;
  }

  /** Latest value + 30-day change per benchmark — for the API and the analysis prompts. */
  async latestBenchmarks(): Promise<EnergyBenchmark[]> {
    const out: EnergyBenchmark[] = [];
    for (const [seriesId, meta] of Object.entries(EIA_SERIES)) {
      const rows = await this.prisma.energyPrice.findMany({
        where: { series: seriesId },
        orderBy: { period: 'desc' },
        take: 45,
      });
      if (rows.length === 0) continue;
      const latest = rows[0];
      // The row closest to 30 calendar days back (spot series skip
      // weekends/holidays, so exact-date lookup would often miss).
      const target = new Date(latest.period);
      target.setDate(target.getDate() - 30);
      const past = rows.reduce((best, r) =>
        Math.abs(r.period.getTime() - target.getTime()) < Math.abs(best.period.getTime() - target.getTime()) ? r : best,
      );
      const change =
        past.period.getTime() === latest.period.getTime()
          ? null
          : ((Number(latest.value) - Number(past.value)) / Number(past.value)) * 100;
      out.push({
        series: seriesId,
        name: meta.name,
        latestPeriod: latest.period.toISOString().slice(0, 10),
        value: Number(latest.value),
        units: latest.units,
        change30dPct: change === null ? null : Number(change.toFixed(1)),
      });
    }
    return out;
  }
}
