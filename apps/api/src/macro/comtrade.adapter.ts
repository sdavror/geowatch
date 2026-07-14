import { Injectable, Logger } from '@nestjs/common';

// UN Comtrade's public preview API — free, no key. The keyed API allows
// bigger result sets, but TOTAL-commodity annual totals per reporter fit
// comfortably inside the preview's 500-row cap (≤2 flows × ~230 partners
// is queried one flow at a time), so the free tier is sufficient here.
const PREVIEW_BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const REPORTERS_URL = 'https://comtradeapi.un.org/files/v1/app/reference/Reporters.json';

// The preview tier rate-limits per IP; a full ~200-country refresh is a
// background job, so pacing generously beats getting throttled mid-run.
const REQUEST_DELAY_MS = 1_500;

export type TradeFlowCode = 'X' | 'M';

export interface PartnerFlow {
  partnerIso2: string;
  flow: TradeFlowCode;
  year: number;
  valueUsd: bigint;
}

interface ReporterEntry {
  reporterCode: number;
  reporterCodeIsoAlpha2: string | null;
  isGroup: boolean;
}

interface PreviewRow {
  reporterCode: number;
  partnerCode: number;
  flowCode: string;
  refYear: number;
  primaryValue: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class ComtradeAdapter {
  private readonly logger = new Logger(ComtradeAdapter.name);
  // Comtrade keys countries by UN M49 numeric codes; both directions of the
  // mapping come from the same official reference file.
  private iso2ToCode: Map<string, number> | null = null;
  private codeToIso2: Map<number, string> | null = null;

  private async loadReferenceMaps(): Promise<void> {
    if (this.iso2ToCode) return;
    const res = await fetch(REPORTERS_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Comtrade reporters reference responded ${res.status}`);
    const { results } = (await res.json()) as { results: ReporterEntry[] };
    this.iso2ToCode = new Map();
    this.codeToIso2 = new Map();
    for (const r of results) {
      if (r.isGroup || !r.reporterCodeIsoAlpha2) continue;
      this.iso2ToCode.set(r.reporterCodeIsoAlpha2, r.reporterCode);
      this.codeToIso2.set(r.reporterCode, r.reporterCodeIsoAlpha2);
    }
    this.logger.log(`Loaded Comtrade reference: ${this.iso2ToCode.size} reporter codes`);
  }

  async hasReporterCode(iso2: string): Promise<boolean> {
    await this.loadReferenceMaps();
    return this.iso2ToCode!.has(iso2);
  }

  /**
   * A reporter's bilateral TOTAL-commodity flows for its most recent
   * reported year, both directions, top partners only. The preview tier
   * allows exactly ONE period per call, and countries report to Comtrade
   * with different lags — so recent years are tried newest-first, one call
   * each, stopping at the first year that has data for the flow.
   */
  async fetchTopPartners(iso2: string, topN: number): Promise<PartnerFlow[]> {
    await this.loadReferenceMaps();
    const reporterCode = this.iso2ToCode!.get(iso2);
    if (!reporterCode) return [];

    const thisYear = new Date().getFullYear();
    const out: PartnerFlow[] = [];

    for (const flow of ['X', 'M'] as TradeFlowCode[]) {
      // 5-year lookback: most reporters lag 1-2 years, but some stopped
      // reporting entirely (Russia's last submission is 2021) — old data
      // clearly labeled with its year beats no data for interdependence
      // reasoning, and the periodization rules keep the labeling honest.
      for (let year = thisYear - 1; year >= thisYear - 5; year--) {
        const url =
          `${PREVIEW_BASE}?reporterCode=${reporterCode}&period=${year}` +
          `&flowCode=${flow}&cmdCode=TOTAL`;
        const rows = await this.fetchRows(url, `${iso2}/${flow}/${year}`);
        await sleep(REQUEST_DELAY_MS);

        const partnerRows = rows.filter((r) => r.flowCode === flow && r.partnerCode !== 0);
        if (partnerRows.length === 0) continue; // lagging reporter — try an older year

        const top = partnerRows
          .filter((r) => this.codeToIso2!.has(r.partnerCode))
          .sort((a, b) => b.primaryValue - a.primaryValue)
          .slice(0, topN);
        for (const r of top) {
          out.push({
            partnerIso2: this.codeToIso2!.get(r.partnerCode)!,
            flow,
            year,
            valueUsd: BigInt(Math.round(r.primaryValue)),
          });
        }
        break;
      }
    }
    return out;
  }

  /** One preview call with a bounded retry on 429 (the limit is ~1 req/sec, bursts recover in seconds). */
  private async fetchRows(url: string, label: string): Promise<PreviewRow[]> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 && attempt <= 3) {
        await sleep(3_000 * attempt);
        continue;
      }
      if (res.status === 429) throw new Error(`Comtrade rate limit hit (429) for ${label}`);
      if (!res.ok) throw new Error(`Comtrade preview responded ${res.status} for ${label}`);
      const { data } = (await res.json()) as { data: PreviewRow[] | null };
      return data ?? [];
    }
  }
}
