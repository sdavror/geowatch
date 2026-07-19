import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// U.S. International Trade Administration's aggregator — 13 export/sanctions
// screening lists (BIS Entity List, Denied Persons, Treasury SSI, State
// Dept ITAR debarred, etc.) behind one API. Free, but requires a
// self-registered subscription key (developer.trade.gov) — same key-gated
// pattern as Companies House, since account creation isn't something to do
// on the user's behalf.
const BASE_URL = 'https://data.trade.gov/consolidated_screening_list/v1';

// SDN is deliberately excluded: it's the exact same OFAC data our dedicated
// ofac-sdn.adapter.ts already ingests in full (XML, no pagination limits),
// so re-pulling it here through this API's 1050-record pagination ceiling
// would be pure duplicate work for zero new coverage. FSE returned 0 global
// records when researched (2026-07-19) — kept in the list since that's a
// live fact that can change, not a permanent exclusion.
const SOURCES_TO_INGEST = ['DPL', 'DTC', 'EL', 'ISN', 'MBS', 'MEU', 'PLC', 'SSI', 'CAP', 'CMIC', 'UVL', 'FSE'];

const SCOPE_COUNTRIES = ['RU', 'UA', 'BY'];

// Real bug found live: most `addresses[].country`/`ids[].country` values
// are clean ISO2, but this API also uses free-text labels like "crimea
// (occupied)" for some records — Postgres's CHAR(2)/VARCHAR(2) columns
// rejected that with "value too long for column's type" and crashed the
// whole ingestion run partway through. Same pattern as this project's
// existing OFAC_COUNTRY_NAME_ALIASES table (Crimea = Ukraine, per the
// map's own UN-recognised-borders convention) — normalize known non-ISO2
// labels, drop anything else unrecognised rather than risk another crash.
const COUNTRY_LABEL_ALIASES: Record<string, string> = {
  'crimea (occupied)': 'UA',
};

function normalizeCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_LABEL_ALIASES[raw.trim().toLowerCase()] ?? null;
}

// The API's own `type` field (Individual/Entity) is populated for SDN/SSI
// but consistently NULL for several other lists (confirmed live: EL, DPL,
// DTC, ISN, MEU, PLC, UVL all returned 0 results under `types=Entity` even
// though e.g. EL clearly contains real companies) — so it can't be trusted
// as a filter. Classify client-side instead: an individual-only field
// present (birth date/place, citizenship, nationality) is a much more
// reliable "this is a person, not a company" signal across all 13 lists.
function isLikelyIndividual(r: RawCslRecord): boolean {
  return (
    r.type === 'Individual' ||
    (r.dates_of_birth?.length ?? 0) > 0 ||
    (r.places_of_birth?.length ?? 0) > 0 ||
    (r.citizenships?.length ?? 0) > 0 ||
    (r.nationalities?.length ?? 0) > 0
  );
}

// Only some of the free-text `ids[].type` values are genuine registration
// identifiers — the rest is sanctions metadata (Executive Order directive
// text, effective/listing dates, target type, website, email) that doesn't
// belong in EntityIdentifier. Ambiguous ones (reg number vs tax id in all
// but name) go through resolveIdentifierType like OFSI's free-text field;
// "Tax ID No." is unambiguous enough to map directly.
const REG_NUMBER_ID_TYPES = new Set([
  'Registration Number',
  'Registration ID',
  'Public Registration Number',
  'Government Gazette Number',
  'Legal Entity Number',
]);
const TAX_ID_TYPES = new Set(['Tax ID No.']);

export interface CslIdentifierCandidate {
  rawType: string;
  value: string;
  countryIso2: string | null;
}

export interface CslEntity {
  externalId: string; // the API's own `id`, e.g. "EL-f6528bb6..." — globally unique, no composite-key hacks needed
  name: string;
  aliases: string[];
  programs: string[]; // record.programs if non-empty, else [record.source] as a fallback label
  sourceAbbrev: string;
  identifiers: CslIdentifierCandidate[];
  countryIso2: string | null; // best-effort from addresses[0].country — already ISO2, no name-mapping needed
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  raw: unknown;
}

interface RawCslRecord {
  id: string;
  name: string;
  alt_names?: string[];
  type?: string | null;
  programs?: string[];
  source: string;
  dates_of_birth?: unknown[];
  places_of_birth?: unknown[];
  citizenships?: unknown[];
  nationalities?: unknown[];
  addresses?: Array<{ country?: string | null; address?: string; city?: string; postal_code?: string }>;
  ids?: Array<{ type: string; country: string | null; number: string }>;
}

interface SearchResponse {
  total: number;
  results: RawCslRecord[];
}

@Injectable()
export class UsCslAdapter {
  private readonly logger = new Logger(UsCslAdapter.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return !!this.config.get<string>('TRADE_GOV_API_KEY');
  }

  // Real bug found live: a first version treated any non-OK response
  // (including 429) as "0 results" and moved on — which silently
  // undercounted lists that genuinely have data (SSI/RU, confirmed 253+
  // real records elsewhere, came back empty in one run purely from rate
  // limiting). 429s here carry no Retry-After header, so this backs off
  // with a fixed-growing delay rather than trusting one.
  private async search(params: Record<string, string>, attempt = 1): Promise<SearchResponse> {
    const key = this.config.get<string>('TRADE_GOV_API_KEY') ?? '';
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}/search?${qs}`, { headers: { 'subscription-key': key } });
    if (res.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      return this.search(params, attempt + 1);
    }
    if (!res.ok) {
      this.logger.warn(`CSL search (${qs}) responded ${res.status} after ${attempt} attempt(s)`);
      return { total: 0, results: [] };
    }
    return (await res.json()) as SearchResponse;
  }

  private toEntity(r: RawCslRecord): CslEntity {
    const address = r.addresses?.[0];
    const countryIso2 = normalizeCountry(address?.country ?? null);
    const identifiers: CslIdentifierCandidate[] = (r.ids ?? [])
      .filter((i) => REG_NUMBER_ID_TYPES.has(i.type) || TAX_ID_TYPES.has(i.type))
      .filter((i) => i.number)
      .map((i) => ({ rawType: i.type, value: i.number, countryIso2: normalizeCountry(i.country) ?? countryIso2 }));

    return {
      externalId: r.id,
      name: r.name,
      aliases: r.alt_names ?? [],
      programs: r.programs?.length ? r.programs : [r.source],
      sourceAbbrev: r.id.split('-')[0],
      identifiers,
      countryIso2,
      addressLine: address?.address || null,
      addressCity: address?.city || null,
      addressPostalCode: address?.postal_code || null,
      raw: r,
    };
  }

  /**
   * Fetches every RU/UA/BY-scoped company record across the non-SDN
   * screening lists. Paginates per (source, country) — the finest
   * server-side split available, since this API caps offset+size at 1050
   * per query and a combined `countries=RU,UA,BY` query on a large list
   * (e.g. Entity List) exceeds that. One combo (Entity List × Russia) still
   * runs slightly over 1050 even split this finely — logged, not silently
   * dropped, rather than adding a third split dimension for a ~4% remainder.
   */
  async fetchEntities(): Promise<CslEntity[]> {
    if (!this.configured) return [];

    const seen = new Map<string, CslEntity>();
    let individualsSkipped = 0;
    let truncatedCombos = 0;

    for (const source of SOURCES_TO_INGEST) {
      for (const country of SCOPE_COUNTRIES) {
        // Real bug found live: the pacing delay only ran inside the
        // pagination loop below — the per-combo "how many are there" probe
        // calls fired back-to-back with no delay at all, which is exactly
        // what triggered a wall of 429s across most combos in the first
        // live run (several genuinely non-empty lists, e.g. SSI, came back
        // as "0 results" purely from being rate-limited on this call).
        await new Promise((resolve) => setTimeout(resolve, 400));
        const first = await this.search({ sources: source, countries: country, size: '1', offset: '0' });
        if (first.total === 0) continue;

        const cap = Math.min(first.total, 1050);
        if (first.total > 1050) {
          truncatedCombos++;
          this.logger.warn(
            `CSL ${source}/${country}: ${first.total} records exceeds the API's 1050-per-query pagination ceiling — fetching the first 1050, ${first.total - 1050} not retrieved this run.`,
          );
        }

        for (let offset = 0; offset < cap; offset += 50) {
          const page = await this.search({
            sources: source,
            countries: country,
            size: String(Math.min(50, cap - offset)),
            offset: String(offset),
          });
          for (const r of page.results) {
            if (isLikelyIndividual(r)) {
              individualsSkipped++;
              continue;
            }
            if (!seen.has(r.id)) seen.set(r.id, this.toEntity(r));
          }
          // Azure APIM free tier — space requests out rather than bursting
          // (an earlier unpaced research loop saw intermittent request
          // failures under rapid back-to-back calls).
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    }

    this.logger.log(
      `US CSL (non-SDN lists): ${seen.size} company records in RU/UA/BY scope, ${individualsSkipped} individual records skipped${truncatedCombos ? `, ${truncatedCombos} source/country combo(s) hit the pagination ceiling` : ''}`,
    );
    return [...seen.values()];
  }

  /**
   * Re-derives address fields from an already-stored EntitySourceLink.raw
   * (the full API record was always kept as-is here, unlike some other
   * adapters that only preserved a mapped subset) — lets the one-time
   * company-profile backfill run with zero new HTTP calls for this source.
   */
  extractAddressFromRaw(raw: unknown): { addressLine: string | null; addressCity: string | null; addressPostalCode: string | null } {
    const r = raw as RawCslRecord;
    const address = r.addresses?.[0];
    return {
      addressLine: address?.address || null,
      addressCity: address?.city || null,
      addressPostalCode: address?.postal_code || null,
    };
  }
}
