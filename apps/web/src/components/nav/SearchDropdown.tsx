'use client';

import { useRouter } from 'next/navigation';
import { useArticleSearch } from '@/hooks/useArticles';
import { useCountries } from '@/hooks/useCountries';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import type { EventCategory } from '@geowatch/shared-types';

const MAX_COUNTRIES = 4;

/**
 * Global search results panel — articles (server-side title search) and
 * countries (client-side filter over the already-cached country list),
 * so a reader typing a country name lands on its dashboard rather than
 * an empty "no stories match" state. Anchored under the navbar's search
 * input by the caller (which is `relative`-positioned).
 */
export function SearchDropdown({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const router = useRouter();
  const q = query.trim().toLowerCase();
  const { results: articles, isLoading } = useArticleSearch(query);
  const { countries } = useCountries();

  const matchedCountries = countries.filter((c) => c.name.toLowerCase().includes(q)).slice(0, MAX_COUNTRIES);

  const go = (href: string) => {
    router.push(href);
    onNavigate();
  };

  if (!isLoading && articles.length === 0 && matchedCountries.length === 0) {
    return (
      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-border/10 bg-bg-2 p-4 shadow-pop">
        <p className="text-center text-[13px] text-text-tertiary">No matches for &ldquo;{query}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border/10 bg-bg-2 p-2 shadow-pop">
      {matchedCountries.length > 0 && (
        <div className="mb-1">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Countries
          </div>
          {matchedCountries.map((c) => (
            <button
              key={c.id}
              onClick={() => go(`/country/${c.id}`)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-3"
            >
              <span className="text-lg">{c.flagEmoji}</span>
              <span className="text-[13px] font-medium text-text-primary">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {articles.length > 0 && (
        <div>
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Stories
          </div>
          {articles.map((a) => {
            const cat = a.category as EventCategory | null;
            return (
              <button
                key={a.id}
                onClick={() => go(`/news/${a.id}`)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-3"
              >
                <span className="mt-1 flex-shrink-0 text-base">{a.country?.flagEmoji ?? '🌐'}</span>
                <span className="min-w-0">
                  {cat && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: CATEGORY_COLOR[cat] }}>
                      {CATEGORY_LABEL[cat]}
                    </span>
                  )}
                  <span className="block line-clamp-2 text-[13px] font-medium leading-snug text-text-primary">
                    {a.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
