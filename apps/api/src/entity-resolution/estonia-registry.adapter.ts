import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// Estonia's e-Business Register publishes its FULL company register as
// free, keyless bulk downloads (CSV/XML/JSON) — no API key, no account,
// unlike the authenticated real-time API this same agency also offers.
// See docs/entity-sources.md for what was tried and confirmed live.
const KASUSAAJAD_URL =
  'https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__kasusaajad.json.zip';

// Beneficial owner's *residence* country (ISO alpha-3, this file's own
// convention) — not the company's, which is always Estonia. A Russian,
// Ukrainian, or Belarusian national controlling an Estonian shell company
// is exactly the sanctions-evasion signal this project's RU/UA/BY scope
// exists to surface, even though the company itself carries no sanction.
const OWNER_COUNTRY_SCOPE: Record<string, string> = { RUS: 'RU', UKR: 'UA', BLR: 'BY' };

export interface EstoniaLinkedCompany {
  externalId: string; // ariregistri_kood (Estonian registration code), as string
  name: string;
  ownerCountries: string[]; // ISO2 residence countries of the in-scope beneficial owner(s)
  raw: unknown;
}

interface RawBeneficialOwner {
  aadress_riik?: string | null;
}

interface RawCompany {
  ariregistri_kood: number;
  nimi: string;
  kasusaajad?: RawBeneficialOwner[];
}

@Injectable()
export class EstoniaRegistryAdapter {
  private readonly logger = new Logger(EstoniaRegistryAdapter.name);

  /**
   * Deliberately NOT a full bulk company-registry ingestion (374k+
   * Estonian companies, almost all irrelevant to RU/UA/BY sanctions work)
   * — filters down to the ~5,000-owner-record subset with a beneficial
   * owner resident in Russia, Ukraine, or Belarus, same RU/UA/BY-scoping
   * convention every other source in this project follows. The individual
   * beneficial owners themselves are NOT modelled as Entities (same
   * reasoning as Companies House PSC — Entity.entityType only supports
   * 'company'); only the Estonian company they control becomes an Entity,
   * with the ownership signal preserved in its raw payload for later use.
   */
  async fetchBeneficialOwnershipLinkedCompanies(): Promise<EstoniaLinkedCompany[]> {
    const buffer = await this.downloadViaWget();

    const zip = new AdmZip(buffer);
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.json'));
    if (!entry) throw new Error('Estonia beneficial-owners zip contained no .json entry');

    const companies = JSON.parse(entry.getData().toString('utf8')) as RawCompany[];
    const out: EstoniaLinkedCompany[] = [];

    for (const c of companies) {
      const ownerCountries = [
        ...new Set(
          (c.kasusaajad ?? [])
            .map((o) => (o.aadress_riik ? OWNER_COUNTRY_SCOPE[o.aadress_riik] : undefined))
            .filter((v): v is string => Boolean(v)),
        ),
      ];
      if (ownerCountries.length === 0) continue;
      out.push({ externalId: String(c.ariregistri_kood), name: c.nimi, ownerCountries, raw: c });
    }

    this.logger.log(
      `Estonia e-Business Register: ${companies.length} companies scanned → ${out.length} with a RU/UA/BY-resident beneficial owner`,
    );
    return out;
  }

  /**
   * Real bug found live: this host's Cloudflare-fronted download blocks
   * Node's native fetch() (undici) with a 403, but allows wget through —
   * confirmed by testing both from inside the same container against the
   * same URL. This isn't a User-Agent or header issue (tried both); it
   * looks like a TLS/HTTP-client fingerprint block Cloudflare applies to
   * undici specifically. wget is present in the base image, so shell out
   * to it for this one download rather than the fetch() every other
   * adapter in this project uses.
   */
  private async downloadViaWget(): Promise<Buffer> {
    const tmpPath = join(tmpdir(), `estonia-kasusaajad-${Date.now()}.zip`);
    try {
      await execFileAsync('wget', ['-q', '-O', tmpPath, KASUSAAJAD_URL], { timeout: 120_000 });
      return await readFile(tmpPath);
    } catch (err) {
      throw new Error(`Estonia beneficial-owners file download via wget failed: ${(err as Error).message}`);
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }
}
