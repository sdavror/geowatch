import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// Global Affairs Canada's own consolidated-list XML — the file the official
// download page links to directly, no key required.
const CANADA_SEMA_URL =
  'https://www.international.gc.ca/world-monde/assets/office_docs/international_relations-relations_internationales/sanctions/sema-lmes.xml';

// Same pilot-scope reasoning as OFAC/EU/OFSI. Canada's "Country" field is
// actually the sanctions regulation's regime name (bilingual, English
// first — e.g. "Russia / Russie"), not a registration country.
const REGIME_SCOPE = /russia|belarus|ukraine/i;

export interface CanadaSemaEntity {
  externalId: string;
  name: string;
  aliases: string[];
  program: string; // English regime name, e.g. "Russia"
  raw: unknown;
}

interface RawRecord {
  Country?: string;
  EntityOrShip?: string;
  Aliases?: string;
  Schedule?: string;
  Item?: number | string;
  DateOfListing?: string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Canada's Consolidated Autonomous Sanctions List. Flat XML, one <record>
 * per listed name — individuals carry LastName/GivenName, entities/ships
 * carry EntityOrShip instead. No structured identifiers at all (unlike
 * OFAC/EU/GLEIF) and no group ID tying aliases together the way OFSI's
 * GroupID does — every entity row here is its own record with its own
 * (comma-separated, sometimes language-labelled) Aliases string.
 */
@Injectable()
export class CanadaSemaAdapter {
  private readonly logger = new Logger(CanadaSemaAdapter.name);

  async fetchEntities(): Promise<CanadaSemaEntity[]> {
    const res = await fetch(CANADA_SEMA_URL);
    if (!res.ok) throw new Error(`Canada SEMA fetch responded ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml) as { 'data-set'?: { record?: unknown } };
    const rows = asArray(doc['data-set']?.record) as RawRecord[];

    const entityRows = rows.filter((r) => !!r.EntityOrShip);
    const out: CanadaSemaEntity[] = [];
    for (const r of entityRows) {
      const countryField = r.Country ?? '';
      const englishProgram = countryField.split('/')[0].trim();
      if (!REGIME_SCOPE.test(englishProgram)) continue;

      const name = r.EntityOrShip!.trim();
      const aliases = (r.Aliases ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      out.push({
        externalId: `${slugify(englishProgram)}-${r.Schedule ?? ''}-${r.Item ?? ''}-${slugify(name)}`,
        name,
        aliases,
        program: englishProgram,
        raw: r,
      });
    }

    this.logger.log(
      `Canada SEMA list: ${entityRows.length} entity/ship rows → ${out.length} in RU/UA/BY regime scope`,
    );
    return out;
  }
}
