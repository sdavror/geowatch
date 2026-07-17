'use client';

import useSWR from 'swr';
import { fetcher, API_BASE_URL } from '@/lib/api';
import { getConsent } from '@/lib/consent';
import type { Article } from '@geowatch/shared-types';

const VIEWED_SESSION_KEY = 'apolitics-session-id';

// Session id (and thus per-reader stats) only exists with analytics
// consent. Without it, views still count in aggregate — no identifier.
function sessionId(): string | null {
  if (typeof window === 'undefined') return null;
  if (getConsent() !== 'all') return null;
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
  // Only the referring host is sent — full referrer URLs can carry
  // query-string PII, and "Traffic sources" only needs the domain.
  let referrer: string | null = null;
  try {
    if (getConsent() === 'all' && document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) referrer = host;
    }
  } catch {
    /* malformed referrer — treat as direct */
  }
  fetch(`${API_BASE_URL}/articles/${articleId}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId(), referrer }),
  }).catch(() => {
    /* best-effort analytics only */
  });
}

export function useArticles(filters?: {
  category?: string;
  countryId?: string;
  limit?: number;
  kind?: 'editorial' | 'news';
}) {
  const params = new URLSearchParams();
  if (filters?.category) params.set('category', filters.category);
  if (filters?.countryId) params.set('countryId', filters.countryId);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.kind) params.set('kind', filters.kind);
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
