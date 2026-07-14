import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// EIA Open Data v2 — free API key (instant email registration).
// Three world benchmarks cover the energy angle of most geopolitical
// events: seaborne crude (Brent), US crude (WTI), US natural gas
// (Henry Hub — the reference LNG-export economics are quoted against).
export const EIA_SERIES: Record<string, { route: string; name: string }> = {
  RBRTE: { route: 'petroleum/pri/spt', name: 'Brent crude spot' },
  RWTC: { route: 'petroleum/pri/spt', name: 'WTI crude spot' },
  RNGWHHD: { route: 'natural-gas/pri/fut', name: 'Henry Hub natural gas spot' },
};

export interface EnergyPricePoint {
  series: string;
  period: Date;
  value: number;
  units: string;
}

interface EiaRow {
  period: string;
  series: string;
  value: string | number;
  units: string;
}

@Injectable()
export class EiaAdapter {
  private readonly logger = new Logger(EiaAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!this.config.get<string>('EIA_API_KEY');
  }

  /** Last ~45 calendar days of one series — enough for a 30-day change with market-holiday slack. */
  async fetchSeries(seriesId: string): Promise<EnergyPricePoint[]> {
    const meta = EIA_SERIES[seriesId];
    if (!meta) throw new Error(`Unknown EIA series "${seriesId}"`);
    const key = this.config.get<string>('EIA_API_KEY');
    if (!key) return [];

    const start = new Date();
    start.setDate(start.getDate() - 45);
    const url =
      `https://api.eia.gov/v2/${meta.route}/data/?api_key=${key}&frequency=daily` +
      `&data[0]=value&facets[series][]=${seriesId}` +
      `&start=${start.toISOString().slice(0, 10)}` +
      `&sort[0][column]=period&sort[0][direction]=desc&length=60`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`EIA responded ${res.status} for ${seriesId}`);
    const body = (await res.json()) as { response: { data: EiaRow[] } };

    return (body.response.data ?? [])
      .filter((r) => r.series === seriesId && r.value !== null)
      .map((r) => ({
        series: r.series,
        period: new Date(r.period),
        value: Number(r.value),
        units: r.units,
      }));
  }
}
