import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

// Japan's own sanctions program (Ministry of Finance, Foreign Exchange and
// Foreign Trade Act asset-freeze list) — free, keyless, single consolidated
// CSV, confirmed live 2026-07-21. Distinct from a UN/US/EU copy: Japan
// maintains and publishes this list itself, even though many entries
// overlap with UN Security Council designations (same cross-source overlap
// this project's fuzzy/LLM resolution already handles for OFAC/EU/UK).
const LIST_PAGE_URL = 'https://www.mof.go.jp/international_policy/gaitame_kawase/gaitame/economic_sanctions/list.html';

export interface JapanMofEntity {
  externalId: string; // the list's own "番号" (number), e.g. "002-000166" — stable across revisions
  name: string;
  aliases: string[];
  addressCountryName: string | null; // free-text English country name, needs the same alias-mapping as OFAC/OFSI
  raw: unknown;
}

interface RawRow {
  '番号': string;
  '個人・団体': string; // '個人' (individual) | '団体' (organization)
  '氏名（英語）': string;
  '別名・別称（英語）': string;
  '住所・所在地（国）（英語）': string;
}

@Injectable()
export class JapanMofAdapter {
  private readonly logger = new Logger(JapanMofAdapter.name);

  /**
   * Real bug avoided here, not fixed after the fact: the list page's own
   * download link is RELATIVE ("./shisantouketsu20260715.csv", dated,
   * changes each revision) — resolving it against the wrong base path
   * (e.g. assuming a sibling "gaitame_law" directory) 404s. Always resolve
   * the link found on the live page, never hardcode last session's dated
   * filename.
   */
  private async resolveCsvUrl(): Promise<string> {
    const res = await fetch(LIST_PAGE_URL);
    if (!res.ok) throw new Error(`Japan MOF list page responded ${res.status}`);
    const html = await res.text();
    const match = html.match(/href="(\.\/[^"]+\.csv)"/);
    if (!match) throw new Error('Japan MOF list page: no .csv link found — page structure may have changed');
    return new URL(match[1], LIST_PAGE_URL).toString();
  }

  async fetchEntities(): Promise<JapanMofEntity[]> {
    const csvUrl = await this.resolveCsvUrl();
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`Japan MOF CSV (${csvUrl}) responded ${res.status}`);
    // Shift_JIS-safe: the file is UTF-8 with BOM (confirmed live), no
    // transcoding needed.
    const text = await res.text();
    const rows = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as RawRow[];

    const out: JapanMofEntity[] = [];
    for (const row of rows) {
      if (row['個人・団体'] !== '団体') continue; // organizations only — individuals are out of this project's Entity scope
      const name = row['氏名（英語）']?.trim();
      if (!name) continue;
      const aliases = (row['別名・別称（英語）'] || '')
        .split(';')
        .map((a) => a.trim().replace(/^["“]|["”]$/g, ''))
        .filter(Boolean);
      out.push({
        externalId: row['番号'],
        name,
        aliases,
        addressCountryName: row['住所・所在地（国）（英語）']?.trim() || null,
        raw: row,
      });
    }
    this.logger.log(`Japan MOF sanctions list: ${rows.length} total rows → ${out.length} organizations`);
    return out;
  }
}
