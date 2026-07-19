import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

// DFAT's own direct download link — the URL the consolidated-list page
// links to, no key required. Only free/keyless source in this project so
// far that ships as XLSX rather than XML/JSON.
const DFAT_URL = 'https://www.dfat.gov.au/sites/default/files/Australian_Sanctions_Consolidated_List.xlsx';

// Same pilot-scope reasoning as OFAC/EU/OFSI/Canada. DFAT's "Committees"
// column carries the sanctions regime, e.g. "Autonomous (Russia)" for
// Australia's own autonomous sanctions vs. UN Security Council committees
// for the multilateral ones — RU/UA/BY autonomous listings are exactly the
// pilot's scope.
const REGIME_SCOPE = /russia|belarus|ukraine/i;

export interface DfatEntity {
  externalId: string; // base Reference number, alias suffix letters stripped
  name: string;
  aliases: string[];
  program: string; // Committees value, e.g. "Autonomous (Russia)"
  raw: unknown;
}

interface RawRow {
  Reference?: string | number;
  'Name of Individual or Entity'?: string;
  Type?: string;
  'Name Type'?: string;
  Committees?: string;
}

/**
 * Australia's DFAT Consolidated Sanctions List. Same flat "one row per name
 * variant, grouped by a shared reference" shape as UK OFSI's GroupID, but
 * the group key here is the base Reference number with its trailing
 * alias-suffix letter stripped (e.g. "2780", "2780a", "2780b" → group
 * "2780") rather than a dedicated group column.
 */
@Injectable()
export class AustraliaDfatAdapter {
  private readonly logger = new Logger(AustraliaDfatAdapter.name);

  async fetchEntities(): Promise<DfatEntity[]> {
    const res = await fetch(DFAT_URL);
    if (!res.ok) throw new Error(`DFAT fetch responded ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });

    const entityRows = rows.filter((r) => r.Type === 'Entity' && REGIME_SCOPE.test(r.Committees ?? ''));
    const byGroup = new Map<string, RawRow[]>();
    for (const r of entityRows) {
      const ref = String(r.Reference ?? '').trim();
      const base = ref.replace(/[a-z]+$/i, '');
      if (!base) continue;
      const arr = byGroup.get(base) ?? [];
      arr.push(r);
      byGroup.set(base, arr);
    }

    const out: DfatEntity[] = [];
    for (const [base, group] of byGroup) {
      const names = group.map((r) => r['Name of Individual or Entity']?.trim()).filter((n): n is string => Boolean(n));
      if (names.length === 0) continue;
      const primaryIdx = group.findIndex((r) => r['Name Type'] === 'Primary Name');
      const name = names[primaryIdx >= 0 ? primaryIdx : 0];
      const aliases = names.filter((n) => n !== name);
      const program = group.find((r) => r.Committees)?.Committees ?? '';

      out.push({ externalId: base, name, aliases, program, raw: group });
    }

    this.logger.log(
      `Australia DFAT list: ${entityRows.length} entity name-rows → ${byGroup.size} grouped entities in RU/UA/BY regime scope`,
    );
    return out;
  }
}
