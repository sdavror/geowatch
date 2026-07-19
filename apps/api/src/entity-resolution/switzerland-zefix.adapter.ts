import { Injectable, Logger } from '@nestjs/common';

// Switzerland's Central Business Names Index (Zefix). The OFFICIAL
// documented API at zefix.admin.ch requires an authenticated subscription
// (confirmed live: 401 without a key). This adapter instead uses the
// undocumented API the www.zefix.ch frontend itself calls — confirmed live
// 2026-07-20 to work with no key and no auth header at all. Undocumented
// means it could change without notice (same caveat as any frontend-only
// API in this codebase); worth revisiting if it ever breaks.
const BASE_URL = 'https://www.zefix.ch/ZefixREST/api/v1/firm';

export interface SwitzerlandRegistryResult {
  ehraid: number;
  uid: string; // Swiss UID, e.g. "CHE-103.101.282" — the country's real registration-number equivalent
  name: string;
  addressCity: string | null; // Zefix (the federal name INDEX) doesn't carry a street address — only the canton/commune the company is registered in. Full street address lives in the cantonal commercial register (linked via cantonalExcerptWeb), out of scope for a bulk-friendly field.
  status: string; // normalized: active | dissolved | unknown
  raw: unknown;
}

// Empirically confirmed by searching known-defunct companies (2026-07-20) —
// no official enum documentation found, so only map what was actually
// observed rather than guess the rest.
const STATUS_MAP: Record<string, string> = {
  EXISTIEREND: 'active',
  IN_AUFLOESUNG: 'dissolved', // "in liquidation/dissolution"
};

interface RawFirm {
  ehraid: number;
  uid: string;
  uidFormatted: string;
  name: string;
  legalSeat?: string;
  status: string;
}

function toResult(f: RawFirm): SwitzerlandRegistryResult {
  return {
    ehraid: f.ehraid,
    uid: f.uidFormatted,
    name: f.name,
    addressCity: f.legalSeat ?? null,
    status: STATUS_MAP[f.status] ?? 'unknown',
    raw: f,
  };
}

@Injectable()
export class SwitzerlandZefixAdapter {
  private readonly logger = new Logger(SwitzerlandZefixAdapter.name);

  async searchByName(name: string): Promise<SwitzerlandRegistryResult[]> {
    const res = await fetch(`${BASE_URL}/search.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, searchType: 'contains' }),
    });
    if (!res.ok) {
      this.logger.warn(`Zefix search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { list?: RawFirm[] };
    return (body.list ?? []).map(toResult);
  }

  async fetchProfile(ehraid: number): Promise<SwitzerlandRegistryResult | null> {
    const res = await fetch(`${BASE_URL}/${ehraid}.json`);
    if (!res.ok) {
      this.logger.warn(`Zefix profile for ehraid ${ehraid} responded ${res.status}`);
      return null;
    }
    return toResult((await res.json()) as RawFirm);
  }
}
