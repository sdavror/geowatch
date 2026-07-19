import { Injectable, Logger } from '@nestjs/common';

// Finland's PRH (Patentti- ja rekisterihallitus) YTJ v3 API — free, keyless,
// real-time company search over the national business register. Confirmed
// live (2026-07-20): name search and businessId lookup both work with no
// registration. Same on-demand enrichment shape as Companies House/France.
const BASE_URL = 'https://avoindata.prh.fi/opendata-ytj-api/v3/companies';

export interface FinlandRegistryResult {
  businessId: string;
  name: string;
  website: string | null;
  industryCode: string | null;
  industryLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  raw: unknown;
}

interface RawPostOffice {
  city?: string;
  languageCode?: string; // '1' fi, '2' sv, '3' en
}

interface RawAddress {
  type?: number; // 1 = visiting/street address, 2 = postal
  street?: string;
  buildingNumber?: string;
  postCode?: string;
  postOffices?: RawPostOffice[];
}

interface RawDescription {
  languageCode?: string;
  description?: string;
}

interface RawCompany {
  businessId: { value: string };
  names: Array<{ name: string; type: string; endDate?: string }>;
  website?: { url?: string };
  mainBusinessLine?: { type?: string; descriptions?: RawDescription[] };
  addresses?: RawAddress[];
}

function englishOrFirst<T extends { languageCode?: string }>(items: T[] | undefined): T | undefined {
  if (!items?.length) return undefined;
  return items.find((i) => i.languageCode === '3') ?? items[0];
}

function toResult(c: RawCompany): FinlandRegistryResult {
  // type 1 = "current name" per the API's own type enum (2 = auxiliary/prior, 3 = trade name)
  const name = c.names.find((n) => n.type === '1' && !n.endDate)?.name ?? c.names[0]?.name ?? '';
  const address = c.addresses?.find((a) => a.type === 1) ?? c.addresses?.[0];
  const postOffice = englishOrFirst(address?.postOffices);
  return {
    businessId: c.businessId.value,
    name,
    website: c.website?.url || null,
    industryCode: c.mainBusinessLine?.type ?? null,
    industryLabel: englishOrFirst(c.mainBusinessLine?.descriptions)?.description ?? null,
    addressLine: [address?.street, address?.buildingNumber].filter(Boolean).join(' ') || null,
    addressCity: postOffice?.city ?? null,
    addressPostalCode: address?.postCode ?? null,
    raw: c,
  };
}

@Injectable()
export class FinlandYtjAdapter {
  private readonly logger = new Logger(FinlandYtjAdapter.name);

  async searchByName(name: string): Promise<FinlandRegistryResult[]> {
    const res = await fetch(`${BASE_URL}?name=${encodeURIComponent(name)}`);
    if (!res.ok) {
      this.logger.warn(`Finland YTJ search for "${name}" responded ${res.status}`);
      return [];
    }
    const body = (await res.json()) as { companies?: RawCompany[] };
    return (body.companies ?? []).map(toResult);
  }

  async fetchProfile(businessId: string): Promise<FinlandRegistryResult | null> {
    const res = await fetch(`${BASE_URL}?businessId=${encodeURIComponent(businessId)}`);
    if (!res.ok) {
      this.logger.warn(`Finland YTJ profile for ${businessId} responded ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { companies?: RawCompany[] };
    return body.companies?.[0] ? toResult(body.companies[0]) : null;
  }
}
