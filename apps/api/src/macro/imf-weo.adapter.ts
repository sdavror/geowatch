import { Injectable, Logger } from '@nestjs/common';

// IMF World Economic Outlook, via DBnomics (free aggregator, no key).
// Main value over World Bank: forward-looking forecasts up to +5 years —
// this is what lets the composite score be forward-looking, not just
// historical. https://api.db.nomics.world/v22/apidocs
const BASE = 'https://api.db.nomics.world/v22';
const PAGE_SIZE = 500;

export const IMF_WEO_INDICATORS: Record<string, { name: string; unit: string }> = {
  NGDP_RPCH: { name: 'Real GDP growth forecast, %', unit: '%' },
  PCPIPCH: { name: 'Inflation forecast, %', unit: '%' },
  GGXWDG_NGDP: { name: 'Government debt forecast, % GDP', unit: '%' },
  BCA_NGDPD: { name: 'Current account, % GDP', unit: '%' },
  LUR: { name: 'Unemployment forecast, %', unit: '%' },
};

export interface WeoPoint {
  iso3: string;
  year: number;
  value: number;
  isForecast: boolean;
}

interface WeoSeriesDoc {
  dimensions: Record<string, string>;
  period: string[];
  value: (number | string | null)[];
}

interface WeoResponse {
  series: { docs: WeoSeriesDoc[]; num_found: number };
}

@Injectable()
export class ImfWeoAdapter {
  private readonly logger = new Logger(ImfWeoAdapter.name);

  async fetchIndicatorSeries(weoCode: string): Promise<WeoPoint[]> {
    const currentYear = new Date().getFullYear();
    const points: WeoPoint[] = [];
    let offset = 0;

    this.logger.log(`Fetching IMF WEO ${weoCode} via DBnomics...`);
    while (true) {
      const url = new URL(`${BASE}/series/IMF/WEO:latest`);
      url.searchParams.set('dimensions', JSON.stringify({ 'weo-subject': [weoCode] }));
      url.searchParams.set('observations', '1');
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`DBnomics API responded ${res.status} for IMF:${weoCode}`);
      }
      const data = (await res.json()) as WeoResponse;
      const docs = data.series?.docs ?? [];
      if (docs.length === 0) break;

      for (const doc of docs) {
        const iso3 = doc.dimensions?.['weo-country'];
        if (!iso3 || iso3.length !== 3) continue;
        for (let i = 0; i < doc.period.length; i++) {
          const raw = doc.value[i];
          if (raw === null || raw === 'NA') continue;
          const year = Number(String(doc.period[i]).slice(0, 4));
          if (!Number.isFinite(year)) continue;
          points.push({
            iso3,
            year,
            value: Number(raw),
            isForecast: year >= currentYear,
          });
        }
      }

      offset += PAGE_SIZE;
      if (offset >= data.series.num_found) break;
    }
    return points;
  }
}
