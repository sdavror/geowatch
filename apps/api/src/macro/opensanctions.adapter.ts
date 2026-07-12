import { Injectable, Logger } from '@nestjs/common';

// OpenSanctions' consolidated sanctions list. Free tier is non-commercial
// use only; for a commercial B2B product either buy a license (~€95+/mo)
// or swap this for a direct OFAC SDN XML parse (public domain).
//
// There is no longer a free aggregate statistics.json (the endpoint the
// original prototype used has been retired) — the country-level counts are
// derived here by downloading the "simple" targets CSV (~65MB, one row per
// sanctioned entity, no free-text bodies) and counting each entity's
// "countries" column, split on ';' since one entity can be tied to several.
const TARGETS_CSV_URL = 'https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv';
const COUNTRIES_COLUMN_INDEX = 5; // id,schema,name,aliases,birth_date,countries,...

export interface SanctionCount {
  iso2: string;
  count: number;
}

@Injectable()
export class OpenSanctionsAdapter {
  private readonly logger = new Logger(OpenSanctionsAdapter.name);

  async fetchCountryCounts(): Promise<SanctionCount[]> {
    this.logger.log('Fetching OpenSanctions consolidated targets CSV...');
    const res = await fetch(TARGETS_CSV_URL);
    if (!res.ok) {
      throw new Error(`OpenSanctions API responded ${res.status}`);
    }
    const text = await res.text();
    const counts = new Map<string, number>();

    // Skip the header line; one row per sanctioned entity.
    let lineStart = text.indexOf('\n') + 1;
    while (lineStart < text.length) {
      let lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.slice(lineStart, lineEnd);
      lineStart = lineEnd + 1;
      if (!line) continue;

      const countriesField = this.parseCsvField(line, COUNTRIES_COLUMN_INDEX);
      if (!countriesField) continue;
      for (const code of countriesField.split(';')) {
        const iso2 = code.trim().toUpperCase();
        if (iso2.length !== 2) continue;
        counts.set(iso2, (counts.get(iso2) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([iso2, count]) => ({ iso2, count }));
  }

  /**
   * Pragmatic RFC4180-ish field extractor for one CSV line — quoted fields
   * (with "" escaping) are common in this file's name/alias columns, but
   * the columns we actually read (country codes) are never quoted or
   * comma-containing, so we only need to track quote state to correctly
   * skip over the earlier columns, not fully unescape them.
   */
  private parseCsvField(line: string, columnIndex: number): string | null {
    let col = 0;
    let inQuotes = false;
    let fieldStart = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        if (col === columnIndex) return line.slice(fieldStart, i).replace(/^"|"$/g, '');
        col++;
        fieldStart = i + 1;
      }
    }
    if (col === columnIndex) return line.slice(fieldStart).replace(/^"|"$/g, '');
    return null;
  }
}
