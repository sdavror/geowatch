'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type {
  MacroScoreEntry,
  EnergyBenchmarkEntry,
  TradePartnersResponse,
  CountryScoreResponse,
  ConflictSeriesResponse,
} from '@geowatch/shared-types';

// The score refreshes at most once a day server-side — no need for a
// tight client refresh interval like the news feed's.
export function useMacroScores() {
  const { data, error, isLoading } = useSWR<MacroScoreEntry[]>(
    '/macro/scores',
    fetcher,
    { refreshInterval: 30 * 60_000 },
  );

  return {
    scores: data ?? [],
    isLoading,
    isError: !!error,
  };
}

// Energy benchmarks refresh once daily server-side (EIA cron) — same
// refresh cadence as the Country Health scores above.
export function useEnergyBenchmarks() {
  const { data, error, isLoading } = useSWR<EnergyBenchmarkEntry[]>(
    '/macro/energy',
    fetcher,
    { refreshInterval: 30 * 60_000 },
  );

  return {
    benchmarks: data ?? [],
    isLoading,
    isError: !!error,
  };
}

// Trade data refreshes weekly server-side (Comtrade cron) — no need to
// poll; null id skips the fetch (e.g. no country selected on the map).
export function useTradePartners(countryId: string | null) {
  const { data, error, isLoading } = useSWR<TradePartnersResponse>(
    countryId ? `/macro/trade/${countryId}` : null,
    fetcher,
  );

  return {
    trade: data ?? null,
    isLoading,
    // A 404 here just means "no trade data for this country" (~34 states
    // don't report to Comtrade) — not a real error worth surfacing.
    isError: false,
  };
}

// Country Health score history + component breakdown for one country —
// same refresh cadence as the global ranking (daily cron server-side).
export function useCountryScore(countryId: string | null) {
  const { data, error, isLoading } = useSWR<CountryScoreResponse>(
    countryId ? `/macro/scores/${countryId}` : null,
    fetcher,
    { refreshInterval: 30 * 60_000 },
  );

  return {
    score: data ?? null,
    isLoading,
    // A 404 means this country has <50% indicator coverage and was
    // deliberately skipped rather than scored on mostly-missing data.
    isError: false,
  };
}

// UCDP conflict-intensity series (weekly cron server-side).
export function useConflictSeries(countryId: string | null) {
  const { data, error, isLoading } = useSWR<ConflictSeriesResponse>(
    countryId ? `/macro/conflict/${countryId}` : null,
    fetcher,
    { refreshInterval: 30 * 60_000 },
  );

  return {
    conflict: data ?? null,
    isLoading,
    // A 404 means no UCDP events recorded for this country — a real and
    // common state (most countries have zero conflict months), not an error.
    isError: false,
  };
}
