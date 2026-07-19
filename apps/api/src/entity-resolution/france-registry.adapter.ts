import { Injectable, Logger } from '@nestjs/common';

// Free, keyless, no registration — recherche-entreprises.api.gouv.fr is the
// French government's own open aggregation of INSEE SIRENE + RNE company
// data. Unlike Companies House, one search call already returns the full
// profile (name, status, registered-office address) — no separate
// profile/lookup endpoint exists or is needed.
const BASE_URL = 'https://recherche-entreprises.api.gouv.fr';

export interface FranceRegistryResult {
  siren: string;
  name: string;
  sigle: string | null;
  active: boolean;
  countryIso2: string | null; // best-effort from siege address; 'FR' when domestic
}

// SIRENE also carries foreign companies that once registered a French
// branch/establishment — the siege address then names a foreign country
// instead of France. Small local map for the countries plausibly showing up
// here, same spirit as Companies House's CH_COUNTRY_TO_ISO2. Falls back to
// null (unknown) rather than guessing for anything not in this list.
const FR_COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  'royaume-uni': 'GB',
  allemagne: 'DE',
  'etats-unis': 'US',
  'états-unis': 'US',
  russie: 'RU',
  suisse: 'CH',
  'pays-bas': 'NL',
  belgique: 'BE',
  italie: 'IT',
  espagne: 'ES',
  luxembourg: 'LU',
  chine: 'CN',
  chypre: 'CY',
  'iles vierges britanniques': 'VG',
  'îles vierges britanniques': 'VG',
};

interface RawSiege {
  code_pays_etranger: string | null;
  libelle_pays_etranger: string | null;
}

interface RawResult {
  siren: string;
  nom_complet: string;
  sigle: string | null;
  etat_administratif: string;
  siege: RawSiege | null;
}

@Injectable()
export class FranceRegistryAdapter {
  private readonly logger = new Logger(FranceRegistryAdapter.name);

  private countryFromSiege(siege: RawSiege | null): string | null {
    if (!siege) return null;
    if (!siege.code_pays_etranger) return 'FR'; // no foreign-country code => domestic address
    const label = siege.libelle_pays_etranger?.trim().toLowerCase();
    return label ? (FR_COUNTRY_NAME_TO_ISO2[label] ?? null) : null;
  }

  private toResult(r: RawResult): FranceRegistryResult {
    return {
      siren: r.siren,
      name: r.nom_complet,
      sigle: r.sigle,
      active: r.etat_administratif === 'A',
      countryIso2: this.countryFromSiege(r.siege),
    };
  }

  async searchByName(name: string): Promise<FranceRegistryResult[]> {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(name)}&per_page=10`);
    if (!res.ok) {
      this.logger.warn(`France registry search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { results?: RawResult[] };
    return (body.results ?? []).map((r) => this.toResult(r));
  }

  async fetchProfile(siren: string): Promise<FranceRegistryResult | null> {
    const res = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(siren)}&per_page=1`);
    if (!res.ok) {
      this.logger.warn(`France registry profile lookup for ${siren} responded ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { results?: RawResult[] };
    const match = (body.results ?? []).find((r) => r.siren === siren);
    return match ? this.toResult(match) : null;
  }
}
