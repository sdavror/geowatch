'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { Country, CountryWithDetails, RiskScoreEntry } from '@geowatch/shared-types';

export function useCountries(filters?: { status?: string; region?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.region) params.set('region', filters.region);
  if (filters?.search) params.set('search', filters.search);
  const query = params.toString();

  const { data, error, isLoading } = useSWR<Country[]>(
    `/countries${query ? `?${query}` : ''}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  return {
    countries: data ?? [],
    isLoading,
    isError: !!error,
  };
}

export function useCountry(id: string | null) {
  const { data, error, isLoading } = useSWR<CountryWithDetails>(
    id ? `/countries/${id}` : null,
    fetcher,
  );

  return {
    country: data,
    isLoading,
    isError: !!error,
  };
}

export function useRiskHistory(id: string | null, days = 90) {
  const { data, error, isLoading } = useSWR<RiskScoreEntry[]>(
    id ? `/countries/${id}/risk-history?days=${days}` : null,
    fetcher,
  );

  return {
    history: data ?? [],
    isLoading,
    isError: !!error,
  };
}
