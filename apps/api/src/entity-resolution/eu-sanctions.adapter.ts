import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

// EU's own sanctions-map export service. The token is a long-standing
// static value (not a per-user secret) that the public sanctions-map
// website itself uses to fetch this file — there's no self-service EU
// sanctions API otherwise.
const EU_URL =
  'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

// Same pilot-scope reasoning as OFAC: bound to the project's existing
// Russia/Ukraine/Belarus conflict focus rather than the EU's full global
// sanctions list on day one. RUSDA is a distinct EU programme code (Russia
// destabilising-activities) seen alongside plain RUS/UKR/BLR in the data.
const PROGRAM_SCOPE = /^(UKR|BLR|RUS)/;

const IDENTIFIER_TYPES: Record<string, 'reg_number' | 'tax_id'> = {
  regnumber: 'reg_number',
  taxid: 'tax_id',
  fiscalcode: 'tax_id',
};

export interface EuIdentifier {
  type: 'reg_number' | 'tax_id';
  value: string;
  countryIso2: string | null;
}

export interface EuSanctionEntity {
  externalId: string; // logicalId
  name: string;
  aliases: string[];
  programs: string[];
  identifiers: EuIdentifier[];
  raw: unknown;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * EU consolidated financial sanctions list — public EU institutional data,
 * free to reuse. Parses <sanctionEntity classificationCode="E"> (enterprise
 * subjects only, not individuals) within the Russia/Ukraine/Belarus program
 * scope.
 */
@Injectable()
export class EuSanctionsAdapter {
  private readonly logger = new Logger(EuSanctionsAdapter.name);

  async fetchEntities(): Promise<EuSanctionEntity[]> {
    const xml = await this.fetchXmlWithRetry();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });
    const doc = parser.parse(xml) as { export?: { sanctionEntity?: unknown } };
    const rawEntries = asArray(doc.export?.sanctionEntity) as Array<Record<string, unknown>>;

    const out: EuSanctionEntity[] = [];
    for (const e of rawEntries) {
      const subjectType = e.subjectType as { '@_classificationCode'?: string } | undefined;
      if (subjectType?.['@_classificationCode'] !== 'E') continue; // enterprise only

      const regulations = asArray(e.regulation) as Array<{ '@_programme'?: string }>;
      const programs = [...new Set(regulations.map((r) => r['@_programme']).filter((p): p is string => Boolean(p)))];
      if (!programs.some((p) => PROGRAM_SCOPE.test(p))) continue;

      const aliasEntries = asArray(e.nameAlias) as Array<{ '@_wholeName'?: string }>;
      const names = aliasEntries.map((a) => a['@_wholeName']).filter((n): n is string => Boolean(n?.trim()));
      if (names.length === 0) continue;
      const [name, ...aliases] = names;

      const idEntries = asArray(e.identification) as Array<{
        '@_identificationTypeCode'?: string;
        '@_number'?: string;
        '@_countryIso2Code'?: string;
      }>;
      const identifiers: EuIdentifier[] = idEntries
        .filter((id) => id['@_identificationTypeCode'] && IDENTIFIER_TYPES[id['@_identificationTypeCode']])
        .map((id) => ({
          type: IDENTIFIER_TYPES[id['@_identificationTypeCode'] as string],
          value: String(id['@_number'] ?? '').trim(),
          countryIso2:
            id['@_countryIso2Code'] && id['@_countryIso2Code'] !== '00' ? id['@_countryIso2Code'] : null,
        }))
        .filter((id) => id.value.length > 0);

      out.push({
        externalId: String((e as { '@_logicalId'?: string })['@_logicalId'] ?? name),
        name,
        aliases,
        programs,
        identifiers,
        raw: e,
      });
    }

    this.logger.log(
      `EU sanctions list: ${rawEntries.length} total entries → ${out.length} enterprise records in RU/UA/BY program scope`,
    );
    return out;
  }

  // Same large-download flakiness pattern documented on OfacSdnAdapter —
  // this file is ~24MB.
  private async fetchXmlWithRetry(maxAttempts = 4): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Fetching EU sanctions list (attempt ${attempt}/${maxAttempts})...`);
        const res = await fetch(EU_URL);
        if (!res.ok) throw new Error(`EU sanctions fetch responded ${res.status}`);
        return await res.text();
      } catch (err) {
        lastErr = err;
        this.logger.warn(`EU sanctions fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('EU sanctions fetch failed after retries');
  }
}
