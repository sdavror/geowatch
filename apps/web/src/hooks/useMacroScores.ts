'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { MacroScoreEntry, EnergyBenchmarkEntry, TradePartnersResponse } from '@geowatch/shared-types';

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
