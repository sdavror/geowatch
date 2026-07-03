'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { HealthCheck } from '@geowatch/shared-types';

export function useHealth() {
  const { data, error, isLoading } = useSWR<HealthCheck>(
    '/health',
    fetcher,
    { refreshInterval: 15_000 },
  );

  return {
    health: data,
    isLoading,
    isError: !!error,
  };
}
