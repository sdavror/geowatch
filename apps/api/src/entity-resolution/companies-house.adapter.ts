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
}

// Companies House's own address.country is a free-text name ("United
// Kingdom", "Scotland", "Wales"...), not an ISO code — small local map
// rather than pulling in the full Country table for a handful of values.
const CH_COUNTRY_TO_ISO2: Record<string, string> = {
  'united kingdom': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
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
      registered_office_address?: { country?: string };
    };
    const countryName = d.registered_office_address?.country?.trim().toLowerCase();
    return {
      companyNumber: d.company_number,
      name: d.company_name,
      status: d.company_status,
      previousNames: (d.previous_company_names ?? []).map((n) => n.name),
      countryIso2: countryName ? (CH_COUNTRY_TO_ISO2[countryName] ?? null) : null,
    };
  }
}
