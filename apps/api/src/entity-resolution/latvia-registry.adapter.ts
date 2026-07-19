import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

// Latvia's Enterprise Register (Uzņēmumu reģistrs) publishes two separate
// free, keyless bulk CSVs via the national open-data portal: the full
// company register, and a dedicated beneficial-owners file. No API key,
// no account — confirmed live, ordinary fetch() works fine here (unlike
// Estonia's Cloudflare-fronted host, this one doesn't block undici).
const BENEFICIAL_OWNERS_URL =
  'https://data.gov.lv/dati/dataset/b7848ab9-7886-4df0-8bc6-70052a8d9e1a/resource/20a9b26d-d056-4dbb-ae18-9ff23c87bdee/download/beneficial_owners.csv';
const REGISTER_URL =
  'https://data.gov.lv/dati/dataset/4de9697f-850b-45ec-8bba-61fa09ce932f/resource/25e80bf3-f107-4ab4-89ef-251b5b9374e9/download/register.csv';

// Unlike Estonia's file (residence only), Latvia's beneficial-owners CSV
// carries both `nationality` and `residence` as clean ISO2 — checking both
// catches a Russian/Ukrainian/Belarusian national controlling a Latvian
// company even if they've relocated elsewhere, not just current residents.
const SCOPE_COUNTRIES = new Set(['RU', 'UA', 'BY']);

// A handful of dual-nationality/dual-residence owners store multiple ISO2
// codes joined by this file's own `;` delimiter inside one quoted field
// (e.g. `"IL;RU"`) — split before checking scope membership.
function splitCodes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(';').map((c) => c.trim()).filter(Boolean);
}

export interface LatviaLinkedCompany {
  externalId: string; // regcode (Latvian registration number), as string
  name: string;
  ownerCountries: string[]; // ISO2 nationality/residence of the in-scope beneficial owner(s)
  owners: Array<{ name: string; countryIso2: string | null }>; // in-scope owners only
  raw: unknown;
}

interface RawBeneficialOwner {
  legal_entity_registration_number: string;
  forename?: string;
  surname?: string;
  nationality?: string;
  residence?: string;
}

interface RawRegisterRow {
  regcode: string;
  name: string;
}

@Injectable()
export class LatviaRegistryAdapter {
  private readonly logger = new Logger(LatviaRegistryAdapter.name);

  /**
   * Same RU/UA/BY-scoping approach as the Estonia adapter — filters to
   * companies with an in-scope beneficial owner rather than ingesting
   * Latvia's entire company register (which has no nationality signal of
   * its own). Two-file join: the beneficial-owners file only has a
   * registration number, not a company name, so the (much larger) main
   * register file has to be scanned too, just to resolve names for the
   * already-narrowed set of registration numbers.
   */
  async fetchBeneficialOwnershipLinkedCompanies(): Promise<LatviaLinkedCompany[]> {
    const ownersText = await this.fetchTextWithRetry(BENEFICIAL_OWNERS_URL);
    const ownersRows = parse(ownersText, {
      delimiter: ';',
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }) as RawBeneficialOwner[];

    const ownerCountriesByRegcode = new Map<string, Set<string>>();
    const ownersByRegcode = new Map<string, Array<{ name: string; countryIso2: string | null }>>();
    for (const row of ownersRows) {
      // Real bug found live: dual-nationality owners store BOTH codes in one
      // semicolon-joined field inside quotes (e.g. `"IL;RU"`) — since this
      // file's own delimiter IS `;`, a naive equality check against
      // SCOPE_COUNTRIES misses an in-scope code hiding inside a compound
      // value, AND passing the raw 5-char compound straight into a
      // CHAR(2) column crashed the whole ingestion run. Split on `;` and
      // check each individual code.
      const inScopeCodes = [
        ...splitCodes(row.nationality).filter((c) => SCOPE_COUNTRIES.has(c)),
        ...splitCodes(row.residence).filter((c) => SCOPE_COUNTRIES.has(c)),
      ];
      if (inScopeCodes.length === 0) continue;
      const set = ownerCountriesByRegcode.get(row.legal_entity_registration_number) ?? new Set<string>();
      inScopeCodes.forEach((c) => set.add(c));
      ownerCountriesByRegcode.set(row.legal_entity_registration_number, set);

      if (row.forename || row.surname) {
        const owners = ownersByRegcode.get(row.legal_entity_registration_number) ?? [];
        owners.push({
          name: [row.forename, row.surname].filter(Boolean).join(' '),
          countryIso2: inScopeCodes[0],
        });
        ownersByRegcode.set(row.legal_entity_registration_number, owners);
      }
    }
    if (ownerCountriesByRegcode.size === 0) return [];

    const registerText = await this.fetchTextWithRetry(REGISTER_URL);
    const registerRows = parse(registerText, {
      delimiter: ';',
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as RawRegisterRow[];

    const out: LatviaLinkedCompany[] = [];
    for (const row of registerRows) {
      const ownerCountries = ownerCountriesByRegcode.get(row.regcode);
      if (!ownerCountries || !row.name) continue;
      out.push({
        externalId: row.regcode,
        name: row.name,
        ownerCountries: [...ownerCountries],
        owners: ownersByRegcode.get(row.regcode) ?? [],
        raw: row,
      });
    }

    this.logger.log(
      `Latvia Enterprise Register: ${ownersRows.length} beneficial-owner rows, ${ownerCountriesByRegcode.size} companies with a RU/UA/BY owner, ${out.length} resolved to a name in the register`,
    );
    return out;
  }

  // Real bug found live: the 128MB register.csv download died partway
  // through with undici's "TypeError: terminated" (a dropped connection,
  // not an HTTP error status — res.ok was never even reached) on the very
  // first live run. A single unretried fetch() isn't safe for a transfer
  // this size; same retry-on-failure shape as OFSI's XML fetch.
  private async fetchTextWithRetry(url: string, maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`Latvia fetch (${url}) attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`Latvia fetch failed after retries: ${url}`);
  }
}
