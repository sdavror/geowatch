import { Injectable, Logger } from '@nestjs/common';

// Norway's Brønnøysund Register Centre — data.brreg.no is a genuinely free,
// keyless, real-time REST API over the full national company register
// (Enhetsregisteret). One search call gives name/address/industry/website;
// a second call (roller) gives real reported board members and daily
// manager — same on-demand enrichment shape as Companies House/France,
// confirmed live (2026-07-20), no registration or key needed.
const BASE_URL = 'https://data.brreg.no/enhetsregisteret/api';

export interface NorwayRegistryResult {
  orgNumber: string;
  name: string;
  website: string | null;
  industryCode: string | null;
  industryLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  status: string; // normalized: active | dissolved | liquidated
  raw: unknown;
}

export interface NorwayOfficer {
  name: string;
  role: string; // Norwegian role label as-is (e.g. "Daglig leder", "Styremedlem") — untranslated, same spirit as France's `qualite`
}

interface RawAddress {
  adresse?: string[];
  poststed?: string;
  postnummer?: string;
}

interface RawEnhet {
  organisasjonsnummer: string;
  navn: string;
  hjemmeside?: string;
  naeringskode1?: { kode: string; beskrivelse: string };
  forretningsadresse?: RawAddress;
  postadresse?: RawAddress;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
}

interface RawRolle {
  type?: { beskrivelse?: string };
  person?: { navn?: { fornavn?: string; mellomnavn?: string; etternavn?: string }; erDoed?: boolean };
  avregistrert?: boolean;
}

interface RawRollegruppe {
  roller?: RawRolle[];
}

function toResult(e: RawEnhet): NorwayRegistryResult {
  const addr = e.forretningsadresse ?? e.postadresse;
  let status = 'active';
  if (e.konkurs) status = 'liquidated';
  else if (e.underAvvikling || e.underTvangsavviklingEllerTvangsopplosning) status = 'dissolved';
  return {
    orgNumber: e.organisasjonsnummer,
    name: e.navn,
    website: e.hjemmeside || null,
    industryCode: e.naeringskode1?.kode ?? null,
    industryLabel: e.naeringskode1?.beskrivelse ?? null,
    addressLine: addr?.adresse?.filter(Boolean).join(', ') || null,
    addressCity: addr?.poststed ?? null,
    addressPostalCode: addr?.postnummer ?? null,
    status,
    raw: e,
  };
}

@Injectable()
export class NorwayBrregAdapter {
  private readonly logger = new Logger(NorwayBrregAdapter.name);

  async searchByName(name: string): Promise<NorwayRegistryResult[]> {
    const res = await fetch(`${BASE_URL}/enheter?navn=${encodeURIComponent(name)}&size=10`);
    if (!res.ok) {
      this.logger.warn(`Norway Brreg search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { _embedded?: { enheter?: RawEnhet[] } };
    return (body._embedded?.enheter ?? []).map(toResult);
  }

  async fetchProfile(orgNumber: string): Promise<NorwayRegistryResult | null> {
    const res = await fetch(`${BASE_URL}/enheter/${orgNumber}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`Norway Brreg profile for ${orgNumber} responded ${res.status}`);
      return null;
    }
    return toResult((await res.json()) as RawEnhet);
  }

  /** Real reported board members / daily manager — genuine data, not a guess. */
  async fetchOfficers(orgNumber: string): Promise<NorwayOfficer[]> {
    const res = await fetch(`${BASE_URL}/enheter/${orgNumber}/roller`);
    if (!res.ok) return [];
    const body = (await res.json()) as { rollegrupper?: RawRollegruppe[] };
    const out: NorwayOfficer[] = [];
    for (const group of body.rollegrupper ?? []) {
      for (const role of group.roller ?? []) {
        if (role.avregistrert || role.person?.erDoed) continue;
        const p = role.person;
        if (!p?.navn) continue;
        const name = [p.navn.fornavn, p.navn.mellomnavn, p.navn.etternavn].filter(Boolean).join(' ');
        if (!name) continue;
        out.push({ name, role: role.type?.beskrivelse ?? 'rolle' });
      }
    }
    return out;
  }
}
