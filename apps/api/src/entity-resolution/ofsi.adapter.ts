import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// UK Treasury's own consolidated-list blob storage — the URL the official
// download page links to directly, no key required.
const OFSI_URL = 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.xml';

// Same pilot-scope reasoning as OFAC/EU.
const REGIME_SCOPE = /russia|belarus|ukraine/i;

export interface OfsiEntity {
  externalId: string; // GroupID
  name: string;
  aliases: string[];
  programs: string[]; // RegimeName values
  // Best-effort: OFSI's Entity_BusinessRegNumber is free text (e.g.
  // "(1) Kazakhstan BIN - 170440031562"), not a structured field like
  // OFAC/EU/GLEIF. Digit sequences of 6+ are extracted as candidate
  // registration numbers, scoped to the record's own Country field —
  // lower precision than the other three sources, documented rather than
  // silently treated as equally reliable.
  identifiers: Array<{ type: 'reg_number'; value: string; countryName: string | null }>;
  countryName: string | null;
  raw: unknown;
}

interface RawTarget {
  Name6?: string;
  GroupTypeDescription?: string;
  AliasType?: string;
  RegimeName?: string;
  Country?: string;
  Entity_BusinessRegNumber?: string;
  GroupID?: number | string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * UK OFSI consolidated sanctions list. Unlike OFAC/EU (one record per real
 * entity, with aliases nested underneath), OFSI publishes a FLAT list —
 * one <FinancialSanctionsTarget> row per name variant, with a shared
 * GroupID tying every variant of the same real entity together. This
 * adapter groups by GroupID before handing anything to the resolution
 * engine.
 */
@Injectable()
export class OfsiAdapter {
  private readonly logger = new Logger(OfsiAdapter.name);

  async fetchEntities(): Promise<OfsiEntity[]> {
    const xml = await this.fetchXmlWithRetry();
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml) as { ArrayOfFinancialSanctionsTarget?: { FinancialSanctionsTarget?: unknown } };
    const rows = asArray(doc.ArrayOfFinancialSanctionsTarget?.FinancialSanctionsTarget) as RawTarget[];

    const entityRows = rows.filter((r) => r.GroupTypeDescription === 'Entity');
    const byGroup = new Map<string, RawTarget[]>();
    for (const r of entityRows) {
      const gid = String(r.GroupID ?? '');
      if (!gid) continue;
      const arr = byGroup.get(gid) ?? [];
      arr.push(r);
      byGroup.set(gid, arr);
    }

    const out: OfsiEntity[] = [];
    for (const [gid, group] of byGroup) {
      const programs = [...new Set(group.map((r) => r.RegimeName).filter((p): p is string => Boolean(p)))];
      if (!programs.some((p) => REGIME_SCOPE.test(p))) continue;

      const names = group.map((r) => r.Name6?.trim()).filter((n): n is string => Boolean(n));
      if (names.length === 0) continue;
      const primaryIdx = group.findIndex((r) => r.AliasType === 'Primary name' || r.AliasType === 'Primary name variation');
      const name = names[primaryIdx >= 0 ? primaryIdx : 0];
      const aliases = names.filter((n) => n !== name);

      const identifiers: OfsiEntity['identifiers'] = [];
      for (const r of group) {
        for (const value of this.extractRegNumbers(r.Entity_BusinessRegNumber)) {
          identifiers.push({ type: 'reg_number', value, countryName: r.Country ?? null });
        }
      }

      out.push({
        externalId: gid,
        name,
        aliases,
        programs,
        identifiers,
        countryName: group[0].Country ?? null,
        raw: group,
      });
    }

    this.logger.log(
      `UK OFSI list: ${entityRows.length} entity name-rows → ${byGroup.size} grouped entities → ${out.length} in RU/UA/BY regime scope`,
    );
    return out;
  }

  private extractRegNumbers(field: string | undefined): string[] {
    if (!field) return [];
    // Matches runs of 6+ digits (with optional internal spaces/dashes
    // collapsed) — deliberately loose since the source field's format is
    // inconsistent free text across different jurisdictions' registries.
    const matches = field.match(/\d[\d\s-]{5,}\d/g) ?? [];
    return matches.map((m) => m.replace(/[\s-]/g, '')).filter((v) => v.length >= 6);
  }

  private async fetchXmlWithRetry(maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Fetching UK OFSI list (attempt ${attempt}/${maxAttempts})...`);
        const res = await fetch(OFSI_URL);
        if (!res.ok) throw new Error(`OFSI fetch responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`OFSI fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('OFSI fetch failed after retries');
  }
}
