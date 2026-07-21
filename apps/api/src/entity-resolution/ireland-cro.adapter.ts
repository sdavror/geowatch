import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';

// Ireland's CRO Open Data Portal — a CKAN instance publishing a daily,
// free, keyless bulk snapshot of the full company register (CC BY 4.0),
// confirmed live 2026-07-22. Unlike every other on-demand registry in this
// project, there is no live search-by-name endpoint — this bulk file IS
// the only public access method, so "search" here means downloading and
// filtering the ~190MB CSV rather than a per-query API call. Each row
// already carries full profile data (status/address/NACE), so one
// download serves both discovery and profile — no separate fetchProfile
// round-trip needed, unlike Companies House/France.
const DATASET_RESOURCE_URL =
  'https://opendata.cro.ie/dataset/bf6f837d-0946-4c14-9a99-82cd6980c121/resource/3fef41bc-b8f4-4b10-8434-ce51c29b1bba/download/companies.csv.zip';

export interface IrelandCroResult {
  companyNumber: string;
  name: string;
  status: string; // normalized: active | dissolved | liquidated | unknown
  industryCode: string | null; // NACE v2 code
  addressLine: string | null;
  addressPostalCode: string | null;
  raw: unknown;
}

// Confirmed by inspecting the live file's real distinct values (2026-07-22)
// — no official enum documentation found, so only what was actually
// observed is mapped rather than guessed.
const STATUS_MAP: Record<string, string> = {
  normal: 'active',
  dissolved: 'dissolved',
  'dissolved postmerger': 'dissolved',
  'dissolved by divis': 'dissolved',
  'struck off': 'dissolved',
  'strike off listed': 'dissolved',
  ceased: 'dissolved',
  'ceased irl': 'dissolved',
  'deleted cb conversion': 'dissolved',
  'deleted cb merger': 'dissolved',
  'deleted as per se tr': 'dissolved',
  'deleted per se merge': 'dissolved',
  liquidation: 'liquidated',
  'liquidation stayed': 'liquidated',
};

interface RawRow {
  company_num: string;
  company_name: string;
  company_status?: string;
  nace_v2_code?: string;
  company_address_1?: string;
  company_address_2?: string;
  company_address_3?: string;
  company_address_4?: string;
  eircode?: string;
}

function toResult(r: RawRow): IrelandCroResult {
  const addressLine = [r.company_address_1, r.company_address_2, r.company_address_3, r.company_address_4]
    .filter(Boolean)
    .join(', ');
  const statusKey = r.company_status?.trim().toLowerCase();
  return {
    companyNumber: r.company_num,
    name: r.company_name,
    status: statusKey ? (STATUS_MAP[statusKey] ?? 'unknown') : 'unknown',
    industryCode: r.nace_v2_code?.trim() || null,
    addressLine: addressLine || null,
    addressPostalCode: r.eircode?.trim() || null,
    raw: r,
  };
}

@Injectable()
export class IrelandCroAdapter {
  private readonly logger = new Logger(IrelandCroAdapter.name);

  private async fetchAllRows(): Promise<RawRow[]> {
    const buffer = await this.fetchBufferWithRetry(DATASET_RESOURCE_URL);
    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.csv'));
    if (!entry) throw new Error('CRO open-data zip contained no .csv entry');
    const text = entry.getData().toString('utf8');
    return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true }) as RawRow[];
  }

  /**
   * Downloads the full ~190MB register ONCE and filters client-side against
   * every candidate name's first significant word — there is no live
   * search endpoint for this source, unlike every other on-demand registry
   * adapter in this project. Takes an array (canonicalName + aliases)
   * rather than one name at a time specifically to avoid re-downloading
   * 190MB per alias tried.
   *
   * Real bug found live: a first version matched the FULL candidate string
   * as a literal substring — "Ryanair DAC" never matched the real CSV row
   * "RYANAIR DESIGNATED ACTIVITY COMPANY" because the abbreviation "DAC"
   * isn't textually present in the expanded legal-form name. Blocking on
   * just the first significant token ("RYANAIR") finds it regardless of
   * which legal-form variant the caller happened to search with.
   */
  async searchByCandidates(names: string[]): Promise<IrelandCroResult[]> {
    const tokens = [
      ...new Set(
        names
          .map((n) => n.toUpperCase().split(/[^A-Z0-9]+/).find((t) => t.length >= 3))
          .filter((t): t is string => Boolean(t)),
      ),
    ];
    if (!tokens.length) return [];

    const rows = await this.fetchAllRows();
    const matches = rows.filter((r) => {
      const upper = r.company_name?.toUpperCase() ?? '';
      return tokens.some((t) => upper.includes(t));
    });
    this.logger.log(
      `CRO open-data search for [${tokens.join(', ')}]: ${rows.length} total rows, ${matches.length} matched`,
    );
    return matches.slice(0, 100).map(toResult);
  }

  private async fetchBufferWithRetry(url: string, maxAttempts = 4): Promise<Buffer> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`responded ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        lastErr = err;
        this.logger.warn(`CRO open-data fetch attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`CRO open-data fetch failed after retries: ${url}`);
  }
}
