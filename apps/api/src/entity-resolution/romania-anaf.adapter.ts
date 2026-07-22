import { Injectable, Logger } from '@nestjs/common';

// Romania — demoanaf.ro is a free, keyless third-party API over ANAF/ONRC
// data (4M+ companies), confirmed live 2026-07-22. Real search-by-name and
// a rich full profile including real reported administrators/directors —
// one of the more complete sources found in this project. No official rate
// limit hit during testing; the provider's own docs mention 300 req/min.
const BASE_URL = 'https://demoanaf.ro/api';

export interface RomaniaSearchHit {
  cui: number;
  name: string;
  statusLabel?: string;
}

export interface RomaniaCompanyProfile {
  cui: string;
  name: string;
  status: string; // normalized: active | dissolved | unknown
  industryCode: string | null; // CAEN code
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  administrators: Array<{ name: string; role: string }>;
  raw: unknown;
}

// Confirmed by inspecting real live search results (2026-07-22) — only two
// values observed, no official enum documentation found.
const STATUS_MAP: Record<string, string> = {
  'funcțiune': 'active',
  'radiată': 'dissolved',
};

interface RawAdministrator {
  name?: string;
  role?: string;
}

interface RawAddress {
  street?: string;
  number?: string;
  locality?: string;
  county?: string;
  postalCode?: string;
}

interface RawCompany {
  cui: number;
  name: string;
  caenCode?: string;
  headquartersAddress?: RawAddress;
  administrators?: RawAdministrator[];
}

export function normalizeRomaniaStatus(statusLabel: string | undefined): string {
  if (!statusLabel) return 'unknown';
  return STATUS_MAP[statusLabel.trim().toLowerCase()] ?? 'unknown';
}

@Injectable()
export class RomaniaAnafAdapter {
  private readonly logger = new Logger(RomaniaAnafAdapter.name);

  async searchByName(name: string): Promise<RomaniaSearchHit[]> {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(name)}`);
    if (!res.ok) {
      this.logger.warn(`Romania ANAF search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { success?: boolean; data?: RomaniaSearchHit[] };
    return body.data ?? [];
  }

  async fetchProfile(cui: number): Promise<RomaniaCompanyProfile | null> {
    const res = await fetch(`${BASE_URL}/company/${cui}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`Romania ANAF profile for ${cui} responded ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { success?: boolean; data?: RawCompany };
    const c = body.data;
    if (!c) return null;

    const addr = c.headquartersAddress;
    // The full profile endpoint doesn't repeat statusLabel — reuse the
    // search endpoint's hit if the caller has one; otherwise 'unknown'
    // rather than guessing from the boolean `inactive` field, whose
    // relationship to statusLabel wasn't confirmed live.
    return {
      cui: String(c.cui),
      name: c.name,
      status: 'unknown',
      industryCode: c.caenCode?.trim() || null,
      addressLine: [addr?.street, addr?.number].filter(Boolean).join(' ') || null,
      addressCity: addr?.locality?.trim() || null,
      addressPostalCode: addr?.postalCode?.trim() || null,
      administrators: (c.administrators ?? [])
        .filter((a) => a.name)
        .map((a) => ({ name: a.name!.trim(), role: a.role ?? 'administrator' })),
      raw: c,
    };
  }
}
