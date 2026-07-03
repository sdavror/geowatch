'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import type { Article } from '@geowatch/shared-types';

export function useArticles(filters?: { category?: string; countryId?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.countryId) params.set('countryId', filters.countryId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const query = params.toString();

  const { data, error, isLoading } = useSWR<Article[]>(
    `/articles${query ? `?${query}` : ''}`,
    fetcher,
    { refreshInterval: 60_000 },
  );

  return {
    articles: data ?? [],
    isLoading,
    isError: !!error,
  };
}

export function useArticle(id: string | null) {
  const { data, error, isLoading } = useSWR<Article>(id ? `/articles/${id}` : null, fetcher);

  return {
    article: data,
    isLoading,
    isError: !!error,
  };
}
