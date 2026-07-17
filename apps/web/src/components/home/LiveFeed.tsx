'use client';

import { useArticles } from '@/hooks/useArticles';
import { CATEGORY_COLOR } from '@geowatch/shared-types';
import type { Article, EventCategory } from '@geowatch/shared-types';

function formatClock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const FRESH_WINDOW_MS = 60 * 60_000; // last hour reads as "just in"

/**
 * Global live feed: most recent stories across every country, as a
 * timestamped timeline rather than a numbered ranked list — the site's
 * answer to "where are the live events?" from the homepage-hierarchy
 * review. Pulls the same /articles ordering (recency, source-diversified)
 * on its own 60s SWR cycle, independent of the main feed's cache key.
 */
export function LiveFeed({ onOpen }: { onOpen: (a: Article) => void }) {
  const { articles } = useArticles({ limit: 8 });

  if (articles.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-conflict opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-status-conflict" />
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Live feed</h3>
      </div>

      <ol className="flex flex-col gap-3">
        {articles.map((a, i) => {
          const isFresh = a.publishedAt && Date.now() - new Date(a.publishedAt).getTime() < FRESH_WINDOW_MS;
          const cat = a.category as EventCategory | null;
          return (
            <li key={a.id} className="flex gap-3">
              <div className="flex w-12 flex-shrink-0 flex-col items-center">
                <span className="text-[11px] font-medium tabular-nums text-text-tertiary">
                  {formatClock(a.publishedAt)}
                </span>
                <span
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: cat ? CATEGORY_COLOR[cat] : '#94a3b8' }}
                />
                {i < articles.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border/15" />}
              </div>
              <button onClick={() => onOpen(a)} className="group -mt-0.5 min-w-0 flex-1 pb-0.5 text-left">
                {isFresh && (
                  <span className="mb-0.5 inline-block text-[10px] font-semibold uppercase tracking-wider text-status-conflict">
                    Just in
                  </span>
                )}
                <div className="text-[13px] font-medium leading-snug text-text-primary transition-colors group-hover:text-brand-text">
                  {a.title}
                </div>
                {a.source?.name && (
                  <div className="mt-0.5 text-[11px] text-text-tertiary">{a.source.name}</div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
