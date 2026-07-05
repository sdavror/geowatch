'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCountries } from '@/hooks/useCountries';
import { useArticles } from '@/hooks/useArticles';
import { CategoryNav } from '@/components/articles/CategoryNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BreakingTicker } from '@/components/articles/BreakingTicker';
import { CategorySection } from '@/components/articles/CategorySection';
import { NewsListJsonLd } from '@/components/articles/NewsListJsonLd';
import { RiskSidebar } from '@/components/sidebar/RiskSidebar';
import { useAuth } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import type { Article, EventCategory } from '@geowatch/shared-types';

// Fixed block order on the homepage — most urgent categories first.
// Change this array to reorder the sections.
const CATEGORY_ORDER: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];

export default function HomePage() {
  const router = useRouter();
  const [category, setCategory] = useState<EventCategory | null>(null);

  const { countries } = useCountries();
  const { user, canEdit } = useAuth();
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
    // Internal detail page (with comments) rather than the raw source URL —
    // manually-authored posts have synthetic urls that aren't browsable.
    router.push(`/news/${article.id}`);
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
      <NewsListJsonLd articles={articles} />
      {/* Single visible-to-crawlers h1 for the page. Kept off-screen so it
          doesn't duplicate the compact lockup in the header. */}
      <h1 className="sr-only">Apolitics — аполітично про політику, без упереджень</h1>
      <header className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-border/10 bg-bg-2 px-5">
        <Logo />
        {/* The slogan lives beside the lockup (not inside the logo) so the
            mark stays legible at any size — brand lockup system. */}
        <span className="hidden whitespace-nowrap text-[12px] text-text-tertiary xl:inline">
          аполітично про політику
        </span>
        <CategoryNav active={category} onSelect={handleSelectCategory} />
        <span className="ml-auto rounded-full border border-brand/30 bg-brand-bg px-2 py-0.5 text-[11px] text-brand-text">
          ● LIVE
        </span>
        {user ? (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            {mediaUrl(user.avatarUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(user.avatarUrl) as string} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : null}
            {canEdit ? 'Admin' : user.displayName || user.email}
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            Sign in
          </Link>
        )}
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

          {/* World view arranges the blocks two-up on wide screens (more
              headlines above the fold); a single selected category spans
              the full width. Collapses to one column on tablet/mobile. */}
          <div className={category ? '' : 'grid grid-cols-1 gap-x-6 lg:grid-cols-2'}>
            {visibleCategories.map((cat) => (
              <CategorySection
                key={cat}
                category={cat}
                articles={articlesByCategory(cat)}
                onOpenArticle={openArticle}
                layout={category ? 'full' : 'grid'}
              />
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
