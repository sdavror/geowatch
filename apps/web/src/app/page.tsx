'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCountries } from '@/hooks/useCountries';
import { useArticles } from '@/hooks/useArticles';
import { CategoryNav } from '@/components/articles/CategoryNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BreakingTicker } from '@/components/articles/BreakingTicker';
import { ArticleLead } from '@/components/articles/ArticleLead';
import { ArticleCard } from '@/components/articles/ArticleCard';
import { RiskSidebar } from '@/components/sidebar/RiskSidebar';
import type { EventCategory } from '@geowatch/shared-types';

export default function HomePage() {
  const router = useRouter();
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [leadArticleId, setLeadArticleId] = useState<string | null>(null);

  const { countries } = useCountries();
  const handleSelectCategory = (next: EventCategory | null) => {
    setCategory(next);
    setLeadArticleId(null);
  };

  const { articles, isLoading, isError } = useArticles({
    category: category ?? undefined,
  });

  const leadArticle = leadArticleId
    ? articles.find((a) => a.id === leadArticleId) ?? articles[0]
    : articles[0];
  const restArticles = articles.filter((a) => a.id !== leadArticle?.id);

  const handleSelectCountry = (countryId: string) => {
    // Jumping from a country (map dot / risk index row) to an article finds
    // that country's most recent story, if it has one — otherwise falls
    // back to opening the full map where the country can be explored directly.
    const match = articles.find((a) => a.countryId === countryId);
    if (match) {
      setLeadArticleId(match.id);
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

          {leadArticle && <ArticleLead article={leadArticle} />}

          <div className="flex flex-col gap-1">
            {restArticles.map((a) => (
              <ArticleCard key={a.id} article={a} onSelect={setLeadArticleId} />
            ))}
          </div>
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
