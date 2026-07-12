'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { MacroScoreEntry } from '@geowatch/shared-types';

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
