import { Injectable, Logger } from '@nestjs/common';

// Slovakia — orsf.sk aggregates the official RPO/ORSR/RUZ registers into one
// free, keyless REST API. Confirmed live 2026-07-20: real search-by-name and
// full company detail (address, NACE code, status) with no key. Director
// role data exists in the schema (`roles`) but the provider's own docs say
// it requires authentication — comes back empty here, so left out rather
// than reported as "no directors" when it may just be gated.
const BASE_URL = 'https://api.orsf.sk/v1';

export interface SlovakiaRegistryResult {
  ico: string; // IČO — Slovak company identification number
  name: string;
  status: string; // normalized: active | dissolved | unknown
  industryCode: string | null; // NACE code
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  raw: unknown;
}

// Confirmed by live search results (2026-07-20) — "aktívna" (active) and
// "zrušená" (cancelled/dissolved) both observed for real companies.
const STATUS_MAP: Record<string, string> = {
  aktívna: 'active',
  zrušená: 'dissolved',
};

interface RawSearchHit {
  ico: string;
  name: string;
  status?: string;
}

interface RawCompany {
  ico: string;
  name: string;
  status?: string;
  nace?: string;
  street?: string;
  city?: string;
  psc?: string;
}

@Injectable()
export class SlovakiaOrsfAdapter {
  private readonly logger = new Logger(SlovakiaOrsfAdapter.name);

  async searchByName(name: string): Promise<Array<{ ico: string; name: string }>> {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(name)}&limit=10`);
    if (!res.ok) {
      this.logger.warn(`Slovakia ORSF search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { hits?: RawSearchHit[] };
    return (body.hits ?? []).map((h) => ({ ico: h.ico, name: h.name }));
  }

  async fetchProfile(ico: string): Promise<SlovakiaRegistryResult | null> {
    const res = await fetch(`${BASE_URL}/companies/${ico}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`Slovakia ORSF profile for ${ico} responded ${res.status}`);
      return null;
    }
    const c = (await res.json()) as RawCompany;
    return {
      ico: c.ico,
      name: c.name,
      status: c.status ? (STATUS_MAP[c.status] ?? 'unknown') : 'unknown',
      industryCode: c.nace ?? null,
      addressLine: c.street ?? null,
      addressCity: c.city ?? null,
      addressPostalCode: c.psc ?? null,
      raw: c,
    };
  }
}
