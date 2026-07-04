'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCountries } from '@/hooks/useCountries';
import { useArticles } from '@/hooks/useArticles';
import { CategoryNav } from '@/components/articles/CategoryNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BreakingTicker } from '@/components/articles/BreakingTicker';
import { CategorySection } from '@/components/articles/CategorySection';
import { RiskSidebar } from '@/components/sidebar/RiskSidebar';
import type { Article, EventCategory } from '@geowatch/shared-types';

// Fixed block order on the homepage — most urgent categories first.
// Change this array to reorder the sections.
const CATEGORY_ORDER: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];

export default function HomePage() {
  const router = useRouter();
  const [category, setCategory] = useState<EventCategory | null>(null);

  const { countries } = useCountries();
  const handleSelectCategory = (next: EventCategory | null) => {
    setCategory(next);
  };

  const { articles, isLoading, isError } = useArticles();

  // When a category is picked in the nav, show only that block; otherwise
  // show every category that has stories, in CATEGORY_ORDER.
  const visibleCategories = category ? [category] : CATEGORY_ORDER;
  const articlesByCategory = (cat: EventCategory) =>
    articles.filter((a) => a.category === cat);

  const openArticle = (article: Article) => {
    if (article.url) window.open(article.url, '_blank', 'noopener,noreferrer');
  };

  const handleSelectCountry = (countryId: string) => {
    // From a country (map dot / risk index row) jump to its most recent
    // story if it has one, otherwise open the full map to explore it.
    const match = articles.find((a) => a.countryId === countryId);
    if (match) {
      openArticle(match);
    } else {
      router.push('/map');
    }
  };

  return (
    <main className="flex h-screen flex-col bg-bg">
      <header className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-border/10 bg-bg-2 px-5">
        <span className="text-[15px] font-semibold tracking-wide text-text-primary">GeoWatch</span>
        <CategoryNav active={category} onSelect={handleSelectCategory} />
        <span className="ml-auto rounded-full border border-brand/30 bg-brand-bg px-2 py-0.5 text-[10px] text-brand-text">
          ● LIVE
        </span>
        <ThemeToggle />
      </header>

      <BreakingTicker articles={articles} />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isError && (
            <p className="text-xs text-status-conflict">
              Failed to load articles. Make sure the API is running and reachable at
              NEXT_PUBLIC_API_URL.
            </p>
          )}

          {isLoading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
            </div>
          )}

          {!isLoading && !isError && articles.length === 0 && (
            <p className="py-10 text-center text-xs text-text-tertiary">
              No stories yet. Check back soon.
            </p>
          )}

          {visibleCategories.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              articles={articlesByCategory(cat)}
              onOpenArticle={openArticle}
            />
          ))}
        </div>

        <RiskSidebar
          countries={countries}
          onSelectCountry={handleSelectCountry}
          onOpenFullMap={() => router.push('/map')}
        />
      </div>
    </main>
  );
}
