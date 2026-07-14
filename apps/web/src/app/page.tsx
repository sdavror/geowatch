'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useCountries } from '@/hooks/useCountries';
import { useArticles, useMostRead } from '@/hooks/useArticles';
import { useMacroScores } from '@/hooks/useMacroScores';
import { BreakingTicker } from '@/components/articles/BreakingTicker';
import { CategorySection } from '@/components/articles/CategorySection';
import { NewsListJsonLd } from '@/components/articles/NewsListJsonLd';
import { RiskSidebar } from '@/components/sidebar/RiskSidebar';
import { Navbar } from '@/components/nav/Navbar';
import { Footer } from '@/components/nav/Footer';
import { Hero } from '@/components/home/Hero';
import { Newsletter } from '@/components/home/Newsletter';
import { MarketsWidget } from '@/components/home/MarketsWidget';
import { CountryHealthWidget } from '@/components/home/CountryHealthWidget';
import { EnergyWidget } from '@/components/home/EnergyWidget';
import { WeatherWidget } from '@/components/home/WeatherWidget';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@geowatch/shared-types';
import type { Article, EventCategory } from '@geowatch/shared-types';

// Section order on the World view — most urgent categories first.
const CATEGORY_ORDER: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];

export default function HomePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { countries } = useCountries();
  const { articles, isLoading, isError } = useArticles();
  const { articles: mostRead } = useMostRead();
  const { scores: macroScores } = useMacroScores();

  const openArticle = (article: Article) => router.push(`/news/${article.id}`);

  const handleSelectCountry = (countryId: string) => {
    const match = articles.find((a) => a.countryId === countryId);
    if (match) openArticle(match);
    else router.push('/map');
  };

  // The World front page shows every section; search narrows the whole pool
  // by title. Drilling into a single category uses /category/[slug].
  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => a.title.toLowerCase().includes(q));
  }, [articles, search]);

  const lead = view[0];
  const secondary = view.slice(1, 3);
  const heroIds = new Set([lead, ...secondary].filter(Boolean).map((a) => a!.id));

  const latest = useMemo(
    () =>
      [...articles]
        .filter((a) => !heroIds.has(a.id))
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [articles, lead, secondary.length],
  );

  const sectionArticles = (cat: EventCategory) =>
    view.filter((a) => a.category === cat && !heroIds.has(a.id));

  return (
    <div className="min-h-screen bg-bg">
      <NewsListJsonLd articles={articles} />
      <h1 className="sr-only">Apolitics — apolitically about politics, without bias</h1>

      <Navbar active={null} search={search} onSearch={setSearch} />

      <BreakingTicker articles={articles} />

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        {isError && (
          <p className="rounded-xl bg-status-conflict/10 px-4 py-3 text-sm text-status-conflict">
            Failed to load stories. Make sure the API is running and reachable.
          </p>
        )}

        {isLoading && <HomeSkeleton />}

        {!isLoading && !isError && view.length === 0 && (
          <p className="py-16 text-center text-sm text-text-tertiary">
            {search ? `No stories match “${search}”.` : 'No stories yet. Check back soon.'}
          </p>
        )}

        {!isLoading && view.length > 0 && (
          <div className="animate-in grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[1fr_320px]">
            {/* Main column */}
            <div className="min-w-0">
              {lead && <Hero lead={lead} secondary={secondary} onOpen={openArticle} />}

              <div className="mt-10 border-t border-border/10 pt-8">
                <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                  {CATEGORY_ORDER.map((cat) => (
                    <CategorySection
                      key={cat}
                      category={cat}
                      articles={sectionArticles(cat)}
                      onOpenArticle={openArticle}
                      layout="grid"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Editorial sidebar */}
            <aside className="flex flex-col gap-6 lg:sticky lg:top-[104px] lg:h-fit">
              <RiskSidebar
                countries={countries}
                onSelectCountry={handleSelectCountry}
                onOpenFullMap={() => router.push('/map')}
              />

              {/* Most read needs real traffic to be meaningful — stays
                  hidden rather than showing a near-empty ranked list. */}
              {mostRead.length >= 3 && (
                <RankedList title="Most read" articles={mostRead} onOpen={openArticle} />
              )}

              <RankedList title="Latest updates" articles={latest} onOpen={openArticle} />

              <CountryHealthWidget scores={macroScores} />

              <MarketsWidget countries={countries} />

              <EnergyWidget />

              <WeatherWidget />

              <Newsletter />
            </aside>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/** Numbered ranked-list card shared by "Most read" and "Latest updates". */
function RankedList({
  title,
  articles,
  onOpen,
}: {
  title: string;
  articles: Article[];
  onOpen: (a: Article) => void;
}) {
  if (articles.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {title}
      </h3>
      <ol className="flex flex-col divide-y divide-border/10">
        {articles.map((a, i) => (
          <li key={a.id}>
            <button
              onClick={() => onOpen(a)}
              className="group flex w-full gap-3 py-3 text-left first:pt-0 last:pb-0"
            >
              <span className="text-[15px] font-semibold tabular-nums text-brand-text">{i + 1}</span>
              <span className="min-w-0">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: CATEGORY_COLOR[a.category as EventCategory] }}
                >
                  {a.category ? CATEGORY_LABEL[a.category as EventCategory] : 'News'}
                </span>
                <span className="mt-0.5 block text-[13px] font-medium leading-snug text-text-primary transition-colors group-hover:text-brand-text">
                  {a.title}
                </span>
                <span className="mt-1 block text-[11px] text-text-tertiary">
                  {formatRelativeTime(a.publishedAt)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="skeleton aspect-[16/9] w-full rounded-2xl" />
        <div className="skeleton mt-4 h-8 w-3/4" />
        <div className="skeleton mt-3 h-4 w-full" />
        <div className="skeleton mt-2 h-4 w-2/3" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
