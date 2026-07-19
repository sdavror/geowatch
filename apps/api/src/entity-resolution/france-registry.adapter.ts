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
  industryCode: string | null; // NAF/APE code, e.g. "68.20B" — no human label fetched (would need the full NAF nomenclature table)
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  // Real reported directors/managers ("dirigeants") — INSEE/RNE sourced,
  // not a guess. `qualite` (e.g. "Gérant", "Président") is kept as-is,
  // untranslated, same spirit as industryCode having no cross-source label.
  directors: Array<{ name: string; role: string }>;
  raw: unknown;
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
  adresse: string | null;
  libelle_commune: string | null;
  code_postal: string | null;
}

interface RawDirigeant {
  nom?: string;
  prenoms?: string;
  qualite?: string;
  type_dirigeant?: string; // 'personne physique' | 'personne morale'
}

interface RawResult {
  siren: string;
  nom_complet: string;
  sigle: string | null;
  etat_administratif: string;
  activite_principale: string | null;
  siege: RawSiege | null;
  dirigeants?: RawDirigeant[];
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
      industryCode: r.activite_principale,
      addressLine: r.siege?.adresse ?? null,
      addressCity: r.siege?.libelle_commune ?? null,
      addressPostalCode: r.siege?.code_postal ?? null,
      // Only 'personne physique' (real individuals) map onto EntityOfficer —
      // a 'personne morale' director is itself a company and belongs in the
      // ownership graph (EntityRelationship), not this fact-record list;
      // out of scope here since that would mean resolving it as an Entity.
      directors: (r.dirigeants ?? [])
        .filter((d) => d.type_dirigeant === 'personne physique' && (d.nom || d.prenoms))
        .map((d) => ({ name: [d.prenoms, d.nom].filter(Boolean).join(' '), role: d.qualite ?? 'dirigeant' })),
      raw: r,
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
