import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// The OFAC download moved off treasury.gov to this API in 2025 (the old URL
// 302s here) — hit the redirect target directly rather than following it on
// every fetch.
const SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml';

// Public domain (US government work) — no license restriction, unlike the
// OpenSanctions consolidated list this project also uses (CC BY-NC).

// Phase 1 pilot scope: the full SDN list has ~9,800 Entity-type records.
// Bounding to Russia/Ukraine/Belarus programs (~4,400 of them) keeps a
// single ingestion run fast and matches the project's existing conflict
// focus, rather than parsing+resolving the entire global sanctions list on
// day one. Widening this regex is the whole extension story for later.
const PROGRAM_SCOPE = /RUSSIA-EO14024|UKRAINE-EO|BELARUS/;

// Only these idList entry types are structured, cross-referenceable company
// identifiers — OFAC's idList also carries free-text notes ("Executive
// Order 13662 Directive Determination -", "Secondary sanctions risk:",
// website/email) that aren't identifiers in the entity-resolution sense.
const IDENTIFIER_TYPES: Record<string, 'reg_number' | 'tax_id'> = {
  'Registration Number': 'reg_number',
  'Tax ID No.': 'tax_id',
};

export interface OfacIdentifier {
  type: 'reg_number' | 'tax_id';
  value: string;
  countryName: string | null;
}

export interface OfacSdnEntity {
  externalId: string; // OFAC's own uid
  name: string;
  aliases: string[];
  programs: string[];
  identifiers: OfacIdentifier[];
  addressCountryNames: string[];
  raw: unknown;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Downloads and parses the full OFAC SDN list, returning only sdnType=Entity
 * records (companies — not individuals/vessels/aircraft) within the
 * Russia/Ukraine/Belarus program scope. This is the raw per-source shape;
 * EntityIngestionService normalizes it into the common NormalizedEntityRecord
 * before handing it to the resolution engine.
 */
@Injectable()
export class OfacSdnAdapter {
  private readonly logger = new Logger(OfacSdnAdapter.name);

  async fetchEntities(): Promise<OfacSdnEntity[]> {
    const xml = await this.fetchXmlWithRetry();

    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml) as { sdnList?: { sdnEntry?: unknown } };
    const rawEntries = asArray(doc.sdnList?.sdnEntry) as Array<Record<string, unknown>>;

    const out: OfacSdnEntity[] = [];
    for (const e of rawEntries) {
      if (e.sdnType !== 'Entity') continue;

      const programs = asArray(
        (e.programList as { program?: string | string[] } | undefined)?.program,
      ).map(String);
      if (!programs.some((p) => PROGRAM_SCOPE.test(p))) continue;

      const akaEntries = asArray(
        (e.akaList as { aka?: unknown } | undefined)?.aka,
      ) as Array<{ lastName?: string }>;
      const aliases = akaEntries.map((a) => a.lastName).filter((n): n is string => Boolean(n));

      const idEntries = asArray(
        (e.idList as { id?: unknown } | undefined)?.id,
      ) as Array<{ idType?: string; idNumber?: string | number; idCountry?: string }>;
      const identifiers: OfacIdentifier[] = idEntries
        .filter((id) => id.idType && IDENTIFIER_TYPES[id.idType])
        .map((id) => ({
          type: IDENTIFIER_TYPES[id.idType as string],
          value: String(id.idNumber ?? '').trim(),
          countryName: id.idCountry ?? null,
        }))
        .filter((id) => id.value.length > 0);

      const addressEntries = asArray(
        (e.addressList as { address?: unknown } | undefined)?.address,
      ) as Array<{ country?: string }>;
      const addressCountryNames = [
        ...new Set(addressEntries.map((a) => a.country).filter((c): c is string => Boolean(c))),
      ];

      out.push({
        externalId: String(e.uid),
        name: String(e.lastName ?? '').trim(),
        aliases,
        programs,
        identifiers,
        addressCountryNames,
        raw: e,
      });
    }

    this.logger.log(
      `OFAC SDN: ${rawEntries.length} total entries → ${out.length} Entity records in RU/UA/BY program scope`,
    );
    return out;
  }

  // The SDN file is ~28MB — on this host, large streamed downloads through
  // the container's network intermittently get cut off mid-transfer
  // (undici "TypeError: terminated"), the same class of flakiness seen with
  // Docker's own image-layer downloads. A plain retry clears it reliably in
  // practice; this isn't a code bug in the parse logic below.
  private async fetchXmlWithRetry(maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Fetching OFAC SDN list (attempt ${attempt}/${maxAttempts})...`);
        const res = await fetch(SDN_URL);
        if (!res.ok) throw new Error(`OFAC SDN fetch responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`OFAC SDN fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('OFAC SDN fetch failed after retries');
  }
}
