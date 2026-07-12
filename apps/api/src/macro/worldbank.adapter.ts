import { Injectable, Logger } from '@nestjs/common';

// World Bank indicators beyond GDP/population (those already have their own
// pipeline in GdpService — this covers the rest of the "Country Health"
// composite: income, growth, inflation, unemployment, debt, trade, FDI,
// inequality, energy dependence). Free, no key, CC BY-4.0.
// https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
const WB_API_BASE = 'https://api.worldbank.org/v2/country/all/indicator';
const FETCH_WINDOW_YEARS = 20; // WEO/scoring wants a longer trend window than the map's 12y GDP check

export const WORLD_BANK_INDICATORS: Record<string, { name: string; unit: string }> = {
  'NY.GNP.PCAP.PP.CD': { name: 'GNI per capita, PPP', unit: 'USD' },
  'NY.GDP.MKTP.KD.ZG': { name: 'GDP growth, %', unit: '%' },
  'FP.CPI.TOTL.ZG': { name: 'Inflation, CPI %', unit: '%' },
  'SL.UEM.TOTL.ZS': { name: 'Unemployment, %', unit: '%' },
  'GC.DOD.TOTL.GD.ZS': { name: 'Government debt, % GDP', unit: '%' },
  'NE.EXP.GNFS.ZS': { name: 'Exports, % GDP', unit: '%' },
  'BX.KLT.DINV.WD.GD.ZS': { name: 'FDI, % GDP', unit: '%' },
  'SI.POV.GINI': { name: 'Gini index', unit: 'index' },
  'EG.IMP.CONS.ZS': { name: 'Energy imports, % of use', unit: '%' },
};

export interface WorldBankPoint {
  iso2: string;
  iso3: string;
  year: number;
  value: number;
}

interface WorldBankRow {
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}

@Injectable()
export class WorldBankAdapter {
  private readonly logger = new Logger(WorldBankAdapter.name);

  /**
   * Fetches one indicator's series for every country in a single bulk call.
   * Each row already carries both the ISO2 (country.id) and ISO3
   * (countryiso3code) codes — no separate country-metadata call is needed
   * to build the iso2<->iso3 mapping MacroService needs for IMF/DBnomics data.
   */
  async fetchIndicatorSeries(indicatorCode: string): Promise<WorldBankPoint[]> {
    const endYear = new Date().getFullYear();
    const startYear = endYear - FETCH_WINDOW_YEARS;
    const url = `${WB_API_BASE}/${indicatorCode}?format=json&per_page=20000&date=${startYear}:${endYear}`;

    this.logger.log(`Fetching World Bank ${indicatorCode} ${startYear}-${endYear}...`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`World Bank API responded ${res.status} for ${indicatorCode}`);
    }
    const payload = (await res.json()) as [unknown, WorldBankRow[] | null];
    const rows = payload?.[1];
    if (!Array.isArray(rows)) {
      throw new Error(`World Bank API returned an unexpected payload shape for ${indicatorCode}`);
    }

    const points: WorldBankPoint[] = [];
    for (const row of rows) {
      if (row.value === null || row.value === undefined) continue;
      const iso2 = row.country?.id;
      const iso3 = row.countryiso3code;
      const year = Number(row.date);
      if (!iso2 || iso2.length !== 2 || !iso3 || iso3.length !== 3 || !Number.isFinite(year)) {
        continue;
      }
      points.push({ iso2, iso3, year, value: row.value });
    }
    return points;
  }
}
