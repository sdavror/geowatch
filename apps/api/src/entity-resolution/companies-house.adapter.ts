import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Free tier, requires a registered API key (HTTP Basic auth, key as
// username, empty password) — see developer.company-information.service.gov.uk.
// No bulk "list all companies" endpoint exists on this API (that's a
// separate multi-GB CSV product); this is a real-time search+lookup source,
// wired as on-demand enrichment like GLEIF rather than a bulk ingestion.
const BASE_URL = 'https://api.company-information.service.gov.uk';

export interface CompaniesHouseSearchResult {
  companyNumber: string;
  name: string;
  status: string;
}

export interface CompaniesHouseProfile {
  companyNumber: string;
  name: string;
  status: string;
  previousNames: string[];
  countryIso2: string | null; // best-effort from registered_office_address.country
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  sicCode: string | null; // first SIC code, if any — CH gives no human-readable label for these
  raw: unknown; // full API response, kept for backfill/audit (the mapped fields above used to BE the raw payload — real gap this fixes)
}

// Companies House's own free-text company_status values, normalized onto
// this project's fixed active|dissolved|liquidated|unknown set. "In
// administration"/"receivership"/"voluntary-arrangement" are insolvency
// proceedings short of full liquidation — closest honest bucket is
// 'unknown' rather than overstating them as 'active'.
const CH_STATUS_MAP: Record<string, string> = {
  active: 'active',
  dissolved: 'dissolved',
  liquidation: 'liquidated',
  'converted-closed': 'dissolved',
};

// A "Person with Significant Control" — real beneficial-ownership data, not
// a guess. Only the corporate-entity kind maps onto this project's Entity
// graph (as an EntityRelationship, same shape as GLEIF's parent/child);
// individual-person PSCs (real people, with date of birth/nationality) are
// intentionally NOT modelled here — Entity.entityType only supports
// 'company' today, and inventing a Person concept is a schema decision
// bigger than "add a source", so those are surfaced in the raw payload for
// a future round rather than silently dropped or half-modelled.
export interface CompaniesHousePsc {
  kind: string; // 'corporate-entity-person-with-significant-control' | 'individual-person-with-significant-control' | others
  name: string;
  ceased: boolean;
  registrationNumber: string | null;
  countryIso2: string | null; // best-effort from identification.country_registered
  raw: unknown;
}

// Companies House's own address.country / identification.country_registered
// is a free-text name ("United Kingdom", "Scotland", "Uk", "France"...), not
// an ISO code — small local map rather than pulling in the full Country
// table for a handful of values.
const CH_COUNTRY_TO_ISO2: Record<string, string> = {
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  france: 'FR',
  germany: 'DE',
  luxembourg: 'LU',
  cyprus: 'CY',
  netherlands: 'NL',
  switzerland: 'CH',
};

@Injectable()
export class CompaniesHouseAdapter {
  private readonly logger = new Logger(CompaniesHouseAdapter.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return !!this.config.get<string>('COMPANIES_HOUSE_API_KEY');
  }

  private authHeader(): string {
    const key = this.config.get<string>('COMPANIES_HOUSE_API_KEY') ?? '';
    return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
  }

  async searchByName(name: string): Promise<CompaniesHouseSearchResult[]> {
    if (!this.configured) return [];
    const res = await fetch(
      `${BASE_URL}/search/companies?q=${encodeURIComponent(name)}&items_per_page=10`,
      { headers: { Authorization: this.authHeader() } },
    );
    if (!res.ok) {
      this.logger.warn(`Companies House search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as {
      items?: Array<{ company_number: string; title: string; company_status: string }>;
    };
    return (body.items ?? []).map((i) => ({
      companyNumber: i.company_number,
      name: i.title,
      status: i.company_status,
    }));
  }

  async fetchProfile(companyNumber: string): Promise<CompaniesHouseProfile | null> {
    const res = await fetch(`${BASE_URL}/company/${companyNumber}`, {
      headers: { Authorization: this.authHeader() },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`Companies House profile for ${companyNumber} responded ${res.status}`);
      return null;
    }
    const d = (await res.json()) as {
      company_name: string;
      company_number: string;
      company_status: string;
      previous_company_names?: Array<{ name: string }>;
      registered_office_address?: {
        country?: string;
        address_line_1?: string;
        address_line_2?: string;
        locality?: string;
        postal_code?: string;
      };
      sic_codes?: string[];
    };
    const countryName = d.registered_office_address?.country?.trim().toLowerCase();
    const addr = d.registered_office_address;
    return {
      companyNumber: d.company_number,
      name: d.company_name,
      status: d.company_status,
      previousNames: (d.previous_company_names ?? []).map((n) => n.name),
      countryIso2: countryName ? (CH_COUNTRY_TO_ISO2[countryName] ?? null) : null,
      addressLine: [addr?.address_line_1, addr?.address_line_2].filter(Boolean).join(', ') || null,
      addressCity: addr?.locality ?? null,
      addressPostalCode: addr?.postal_code ?? null,
      sicCode: d.sic_codes?.[0] ?? null,
      raw: d,
    };
  }

  normalizeStatus(status: string): string {
    return CH_STATUS_MAP[status] ?? 'unknown';
  }

  async fetchPsc(companyNumber: string): Promise<CompaniesHousePsc[]> {
    const res = await fetch(`${BASE_URL}/company/${companyNumber}/persons-with-significant-control`, {
      headers: { Authorization: this.authHeader() },
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      this.logger.warn(`Companies House PSC lookup for ${companyNumber} responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as {
      items?: Array<{
        kind: string;
        name?: string;
        ceased?: boolean;
        identification?: { registration_number?: string; country_registered?: string };
      }>;
    };
    return (body.items ?? [])
      .filter((i) => i.name)
      .map((i) => {
        const countryName = i.identification?.country_registered?.trim().toLowerCase();
        return {
          kind: i.kind,
          name: i.name!,
          ceased: !!i.ceased,
          registrationNumber: i.identification?.registration_number ?? null,
          countryIso2: countryName ? (CH_COUNTRY_TO_ISO2[countryName] ?? null) : null,
          raw: i,
        };
      });
  }
}
