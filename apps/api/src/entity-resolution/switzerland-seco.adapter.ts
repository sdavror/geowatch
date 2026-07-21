import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// Switzerland's SECO consolidated sanctions list — Switzerland's OWN
// sanctions program (implementing UN/EU-derived measures via Swiss
// ordinances, published under SECO's own authority), distinct from the
// Zefix company-registry adapter already in this project. Real bug from a
// prior session: the download host is `sesam.search.admin.ch` (dot) — a
// prior attempt checked `sesam.search-admin.ch` (hyphen) and got a genuine
// NXDOMAIN, wrongly concluding the whole source was dead. The two hostnames
// differ by one punctuation character.
const XML_URL =
  'https://www.sesam.search.admin.ch/sesam-search-web/pages/downloadXmlGesamtliste.xhtml?lang=de&action=downloadXmlGesamtlisteAction';

export interface SwitzerlandSecoEntity {
  externalId: string; // the list's own target ssid — stable across revisions
  name: string;
  aliases: string[];
  program: string; // the sanctions regime name (e.g. "Belarus", "Iran") — analogous to Canada/Australia's flat program field
  raw: unknown;
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

interface NamePart {
  '@_name-part-type'?: string;
  value?: string;
}

interface Name {
  '@_name-type'?: string;
  '@_lang'?: string;
  'name-part'?: NamePart | NamePart[];
}

interface Identity {
  '@_main'?: string;
  name?: Name | Name[];
}

interface Modification {
  '@_modification-type'?: string;
  '@_effective-date'?: string;
}

interface RawTarget {
  '@_ssid': string;
  'sanctions-set-id'?: string | number;
  entity?: { identity?: Identity | Identity[] };
  individual?: unknown; // present on person records — never read, entities only
  modification?: Modification | Modification[];
}

interface RawSanctionsSet {
  '@_ssid': string | number;
}

interface RawProgram {
  'program-key'?: Array<{ '@_lang'?: string; '#text'?: string }> | { '@_lang'?: string; '#text'?: string };
  'sanctions-set'?: RawSanctionsSet | RawSanctionsSet[];
}

@Injectable()
export class SwitzerlandSecoAdapter {
  private readonly logger = new Logger(SwitzerlandSecoAdapter.name);

  async fetchEntities(): Promise<SwitzerlandSecoEntity[]> {
    const xml = await this.fetchTextWithRetry(XML_URL);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    const doc = parser.parse(xml) as {
      'swiss-sanctions-list': { target?: RawTarget | RawTarget[]; 'sanctions-program'?: RawProgram | RawProgram[] };
    };
    const root = doc['swiss-sanctions-list'];

    // Build sanctions-set-id -> English program name, since a target only
    // references its set (a specific measure within a program), not the
    // program itself directly.
    const setIdToProgram = new Map<string, string>();
    for (const program of toArray(root['sanctions-program'])) {
      const keys = toArray(program['program-key']);
      const englishName = keys.find((k) => k['@_lang'] === 'eng')?.['#text'];
      if (!englishName) continue;
      for (const set of toArray(program['sanctions-set'])) {
        setIdToProgram.set(String(set['@_ssid']), englishName);
      }
    }

    const out: SwitzerlandSecoEntity[] = [];
    let delistedSkipped = 0;
    let individualsSkipped = 0;

    // IMPORTANT: only the top-level target[] array here — modification
    // history blocks nested inside each target ALSO contain full <target>
    // sub-copies (audit trail of past states), which must NOT be iterated
    // as if they were separate current entities. `doc` only surfaces the
    // top-level array via this exact path.
    for (const target of toArray(root.target)) {
      if (!target.entity) {
        individualsSkipped++;
        continue;
      }

      // A target with no history is currently listed. One with history is
      // currently listed unless its MOST RECENT modification (by effective
      // date) is a de-listing — a later 'listed'/'amended' entry would mean
      // it was re-designated after being removed.
      const mods = toArray(target.modification).filter((m) => m['@_effective-date']);
      if (mods.length) {
        const latest = mods.reduce((a, b) => (a['@_effective-date']! > b['@_effective-date']! ? a : b));
        if (latest['@_modification-type'] === 'de-listed') {
          delistedSkipped++;
          continue;
        }
      }

      const identities = toArray(target.entity.identity);
      const mainIdentity = identities.find((i) => i['@_main'] === 'true') ?? identities[0];
      if (!mainIdentity) continue;

      const names = toArray(mainIdentity.name);
      const primaryName = names.find((n) => n['@_name-type'] === 'primary-name') ?? names[0];
      const wholeNamePart = toArray(primaryName?.['name-part']).find(
        (p) => p['@_name-part-type'] === 'whole-name',
      );
      const name = wholeNamePart?.value?.trim();
      if (!name) continue;

      const aliases = names
        .filter((n) => n !== primaryName)
        .flatMap((n) => toArray(n['name-part']))
        .map((p) => p.value?.trim())
        .filter((v): v is string => Boolean(v));

      const program = setIdToProgram.get(String(target['sanctions-set-id'])) ?? 'unknown';

      out.push({ externalId: target['@_ssid'], name, aliases, program, raw: target });
    }

    this.logger.log(
      `SECO sanctions list: ${toArray(root.target).length} total targets → ${out.length} currently-listed entities (${individualsSkipped} individuals skipped, ${delistedSkipped} de-listed skipped)`,
    );
    return out;
  }

  // Real bug found live: the 40MB XML download died mid-transfer with
  // undici's "TypeError: terminated" (a dropped connection, not an HTTP
  // error status) on the first live run — same failure mode as the Latvia
  // 128MB CSV, same fix.
  private async fetchTextWithRetry(url: string, maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`SECO fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`SECO fetch failed after retries: ${url}`);
  }
}
