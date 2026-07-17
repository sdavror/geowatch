import { Injectable, Logger } from '@nestjs/common';

// Free, no API key, no rate-limit key required for light usage. Global
// registry of Legal Entity Identifiers — every LEI record also carries a
// `registeredAs` field: the entity's LOCAL registration number in its home
// jurisdiction's own company register, in whatever format that jurisdiction
// uses (e.g. a Russian OGRN). That field is what lets a GLEIF record and an
// OFAC SDN record resolve to the same Entity by identifier equality.
const GLEIF_BASE = 'https://api.gleif.org/api/v1';

export interface GleifRecord {
  lei: string;
  legalName: string;
  otherNames: string[];
  // Local registration number in the entity's home jurisdiction, or null —
  // not every LEI record has one on file.
  registeredAs: string | null;
  countryIso2: string | null;
  raw: unknown;
}

interface GleifApiEntity {
  legalName?: { name?: string };
  otherNames?: Array<{ name?: string }>;
  transliteratedOtherNames?: Array<{ name?: string }>;
  registeredAs?: string;
  legalAddress?: { country?: string };
}

interface GleifApiRecord {
  attributes?: { lei?: string; entity?: GleifApiEntity };
}

@Injectable()
export class GleifAdapter {
  private readonly logger = new Logger(GleifAdapter.name);

  /**
   * Fulltext search by name — used to DISCOVER a candidate GLEIF record for
   * a company we already know about from another source. This is not itself
   * a matching decision: the caller still hands the result through
   * EntityResolutionService, which only merges on identifier equality. If
   * GLEIF's top hit for "Gazprom Neft" happened to be an unrelated shell
   * company, its identifiers simply wouldn't match anything and it would
   * become (or stay) its own Entity.
   */
  async searchByName(name: string): Promise<GleifRecord[]> {
    const url = `${GLEIF_BASE}/lei-records?filter[fulltext]=${encodeURIComponent(name)}&page[size]=5`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`GLEIF search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { data?: GleifApiRecord[] };
    return (body.data ?? []).map((r) => this.toRecord(r));
  }

  private toRecord(r: GleifApiRecord): GleifRecord {
    const entity = r.attributes?.entity ?? {};
    const otherNames = [
      ...(entity.otherNames ?? []).map((n) => n.name),
      ...(entity.transliteratedOtherNames ?? []).map((n) => n.name),
    ].filter((n): n is string => Boolean(n));
    return {
      lei: r.attributes?.lei ?? '',
      legalName: entity.legalName?.name ?? '',
      otherNames,
      registeredAs: entity.registeredAs?.trim() || null,
      // GLEIF gives ISO 3166-1 alpha-2 directly — no name-to-code mapping
      // needed, unlike OFAC's free-text country names.
      countryIso2: entity.legalAddress?.country ?? null,
      raw: r,
    };
  }
}
