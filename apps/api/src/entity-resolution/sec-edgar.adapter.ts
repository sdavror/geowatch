import { Injectable, Logger } from '@nestjs/common';

// SEC's bulk ticker-to-CIK mapping — free, no key, updated regularly. The
// SEC's fair-access policy requires a descriptive User-Agent identifying
// the requester (name + contact); generic/browser UAs get rate-limited or
// blocked.
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const USER_AGENT = 'Apolitics entity-resolution research contact@apolitics.example';

export interface SecCompany {
  cik: string; // zero-padded to 10 digits, SEC's own convention
  ticker: string;
  name: string;
}

interface RawEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * US public company registry (SEC EDGAR). Unlike the sanctions sources,
 * this isn't scoped by country/regime — it's a general identity source:
 * ~10,400 US-listed companies with a globally-unique CIK, useful for
 * resolving any US-market-adjacent entity (including foreign companies
 * with US listings/ADRs) mentioned elsewhere.
 */
@Injectable()
export class SecEdgarAdapter {
  private readonly logger = new Logger(SecEdgarAdapter.name);

  async fetchCompanies(): Promise<SecCompany[]> {
    this.logger.log('Fetching SEC EDGAR company tickers...');
    const res = await fetch(TICKERS_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      throw new Error(`SEC EDGAR fetch responded ${res.status}`);
    }
    const raw = (await res.json()) as Record<string, RawEntry>;
    const out = Object.values(raw).map((e) => ({
      cik: String(e.cik_str).padStart(10, '0'),
      ticker: e.ticker,
      name: e.title,
    }));
    this.logger.log(`SEC EDGAR: ${out.length} public companies`);
    return out;
  }
}
