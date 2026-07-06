'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_COLOR } from '@geowatch/shared-types';
import { useArticles } from '@/hooks/useArticles';
import { Navbar } from '@/components/nav/Navbar';
import { StoryCard } from '@/components/article/StoryCard';
import { Hero } from '@/components/home/Hero';
import { SLUG_TO_CATEGORY, CATEGORY_INTRO, CATEGORY_NAV_LABEL } from '@/lib/categories';

type Sort = 'newest' | 'oldest';

export default function CategoryPage() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : params.slug?.[0] ?? '';
  const category = SLUG_TO_CATEGORY[slug] as EventCategory | undefined;

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const { articles, isLoading } = useArticles();

  const open = (a: Article) => router.push(`/news/${a.id}`);

  const list = useMemo(() => {
    if (!category) return [];
    const q = search.trim().toLowerCase();
    return articles
      .filter((a) => a.category === category && (!q || a.title.toLowerCase().includes(q)))
      .sort((a, b) => {
        const cmp = (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '');
        return sort === 'newest' ? -cmp : cmp;
      });
  }, [articles, category, search, sort]);

  if (!category) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar active={null} search="" onSearch={() => {}} />
        <div className="mx-auto max-w-[720px] px-6 py-20 text-center">
          <h1 className="text-2xl font-bold text-text-primary">Category not found</h1>
          <Link href="/" className="mt-3 inline-block text-sm text-brand-text hover:underline">
            ← Back to the front page
          </Link>
        </div>
      </div>
    );
  }

  const lead = list[0];
  const secondary = list.slice(1, 3);
  const rest = list.slice(3);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar active={category} search={search} onSearch={setSearch} />

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        {/* Category header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/10 pb-6">
          <div>
            <span
              className="text-[12px] font-semibold uppercase tracking-wider"
              style={{ color: CATEGORY_COLOR[category] }}
            >
              Section
            </span>
            <h1 className="mt-1 text-[38px] font-bold tracking-tight text-text-primary">
              {CATEGORY_NAV_LABEL[category]}
            </h1>
            <p className="mt-1 max-w-xl text-[15px] text-text-secondary">{CATEGORY_INTRO[category]}</p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[13px] text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        {isLoading && (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-64 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && list.length === 0 && (
          <p className="py-16 text-center text-sm text-text-tertiary">
            {search ? `No ${CATEGORY_NAV_LABEL[category]} stories match “${search}”.` : 'No stories in this section yet.'}
          </p>
        )}

        {!isLoading && lead && (
          <>
            {/* Featured — only on the default (newest, unfiltered) view */}
            {sort === 'newest' && !search && (
              <div className="mt-8">
                <Hero lead={lead} secondary={secondary} onOpen={open} />
              </div>
            )}

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(sort === 'newest' && !search ? rest : list).map((a) => (
                <StoryCard key={a.id} article={a} onOpen={open} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
