import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// The UN Security Council's own consolidated sanctions list — genuinely
// multilateral (13 active regimes: ISIL/Al-Qaida, Taliban, DRC, Yemen,
// Libya, Sudan, DPRK, Iran, Somalia, Mali, CAR, Haiti, South Sudan), not a
// copy of any single country's program. A prior session marked this
// "confirmed dead" after `sesam.search-admin.ch`-style domain confusion on
// `scsanctions.un.org` — re-tested live this round: the real access path is
// `scsanctions.un.org/resources/xml/en/consolidated.xml`, which 302-redirects
// to a time-limited Azure blob SAS URL (regenerated per request) serving the
// real ~2MB XML. No key, no login — the redirect itself was the only thing
// standing in the way, and a plain `fetch()` follows it automatically.
const XML_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

export interface UnSecurityCouncilEntity {
  externalId: string; // DATAID — the list's own stable numeric id
  name: string;
  aliases: string[];
  program: string; // UN_LIST_TYPE, e.g. "DRC", "ISIL", "DPRK" — a sanctions regime, not a registration country
  addressCountryName: string | null; // free-text English country name from ENTITY_ADDRESS, needs the shared alias map
  raw: unknown;
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

interface RawAlias {
  ALIAS_NAME?: string;
}

interface RawAddress {
  COUNTRY?: string;
}

interface RawEntity {
  DATAID: number | string;
  FIRST_NAME?: string; // the schema is shared with INDIVIDUAL records — this is actually the entity's name field
  UN_LIST_TYPE?: string;
  ENTITY_ALIAS?: RawAlias | RawAlias[];
  ENTITY_ADDRESS?: RawAddress | RawAddress[];
}

@Injectable()
export class UnSecurityCouncilAdapter {
  private readonly logger = new Logger(UnSecurityCouncilAdapter.name);

  async fetchEntities(): Promise<UnSecurityCouncilEntity[]> {
    const xml = await this.fetchTextWithRetry(XML_URL);

    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml) as {
      CONSOLIDATED_LIST?: { ENTITIES?: { ENTITY?: RawEntity | RawEntity[] } };
    };
    const rows = toArray(doc.CONSOLIDATED_LIST?.ENTITIES?.ENTITY);

    const out: UnSecurityCouncilEntity[] = [];
    for (const r of rows) {
      const name = r.FIRST_NAME?.trim();
      if (!name) continue;

      const aliases = toArray(r.ENTITY_ALIAS)
        .map((a) => a.ALIAS_NAME?.trim())
        .filter((v): v is string => Boolean(v));

      const addresses = toArray(r.ENTITY_ADDRESS);
      const addressCountryName = addresses.find((a) => a.COUNTRY?.trim())?.COUNTRY?.trim() ?? null;

      out.push({
        externalId: String(r.DATAID),
        name,
        aliases,
        program: r.UN_LIST_TYPE ?? 'unknown',
        addressCountryName,
        raw: r,
      });
    }

    this.logger.log(`UN SC consolidated list: ${rows.length} entity rows → ${out.length} usable`);
    return out;
  }

  // Same dropped-connection failure mode as the Latvia/Switzerland SECO
  // bulk downloads (undici "TypeError: terminated" on multi-MB transfers) —
  // same fetch-with-retry fix.
  private async fetchTextWithRetry(url: string, maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`UN SC fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`UN SC fetch failed after retries: ${url}`);
  }
}
