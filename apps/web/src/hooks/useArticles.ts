'use client';

import useSWR from 'swr';
import { fetcher, API_BASE_URL } from '@/lib/api';
import type { Article } from '@geowatch/shared-types';

const VIEWED_SESSION_KEY = 'apolitics-session-id';

function sessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(VIEWED_SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(VIEWED_SESSION_KEY, id);
  }
  return id;
}

/**
 * Fire-and-forget view record for "most read" ranking. Never blocks or
 * throws into the caller — a dropped view ping shouldn't affect reading.
 */
export function recordArticleView(articleId: string) {
  fetch(`${API_BASE_URL}/articles/${articleId}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId() }),
  }).catch(() => {
    /* best-effort analytics only */
  });
}

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

export function useMostRead(days = 7, limit = 6) {
  const { data, error, isLoading } = useSWR<Article[]>(
    `/articles/most-read?days=${days}&limit=${limit}`,
    fetcher,
    { refreshInterval: 5 * 60_000 },
  );

  return {
    articles: data ?? [],
    isLoading,
    isError: !!error,
  };
}
