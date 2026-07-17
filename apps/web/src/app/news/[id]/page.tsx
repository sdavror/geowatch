'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { fetcher, mediaUrl } from '@/lib/api';
import { recordArticleView } from '@/hooks/useArticles';
import { CommentsSection } from '@/components/articles/CommentsSection';
import { ArticleBody } from '@/components/article/ArticleBody';
import { RelatedStories } from '@/components/article/RelatedStories';
import { ShareBar } from '@/components/article/ShareBar';
import { ContentTypeBadge } from '@/components/article/ContentTypeBadge';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/nav/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { readingTimeMinutes } from '@/lib/readingTime';

export default function NewsDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  const { data: article, error, isLoading } = useSWR<Article>(
    id ? `/articles/${id}` : null,
    fetcher,
  );

  // Record exactly one view per mount, once the article resolves — feeds
  // the "Most read" ranking (GET /articles/most-read).
  const recordedFor = useRef<string | null>(null);
  useEffect(() => {
    if (article && recordedFor.current !== article.id) {
      recordedFor.current = article.id;
      recordArticleView(article.id);
    }
  }, [article]);

  const image = mediaUrl(article?.imageUrl);
  const cat = article?.category as EventCategory | null | undefined;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border/10 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <Link href="/" className="text-[13px] text-text-secondary transition-colors hover:text-brand-text">
            ← Back to feed
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-[720px] px-4 py-10 sm:px-6">
        {isLoading && <ArticleSkeleton />}
        {error && <p className="text-sm text-status-conflict">Story not found.</p>}

        {article && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ContentTypeBadge type={article.contentType} />
              {cat && (
                <Link
                  href="/"
                  className="text-[12px] font-semibold uppercase tracking-wider"
                  style={{ color: CATEGORY_COLOR[cat] }}
                >
                  {CATEGORY_LABEL[cat]}
                </Link>
              )}
            </div>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-tight text-text-primary sm:text-[42px]">
              {article.title}
            </h1>
            {article.aiSummary && (
              <p className="mt-4 text-[18px] leading-relaxed text-text-secondary">{article.aiSummary}</p>
            )}

            {/* Byline */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border/10 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-bg text-[13px] font-bold text-brand-text">
                  A
                </span>
                <div className="leading-tight">
                  <div className="text-[13px] font-semibold text-text-primary">Apolitics Newsroom</div>
                  <div className="text-[12px] text-text-tertiary">
                    {formatRelativeTime(article.publishedAt)}
                    {article.country?.name && ` · ${article.country.name}`}
                    {' · '}
                    {readingTimeMinutes(article.body, article.aiSummary)} min read
                  </div>
                </div>
              </div>
              <div className="ml-auto">
                <ShareBar title={article.title} />
              </div>
            </div>

            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="mt-8 w-full rounded-2xl border border-border/10 object-cover shadow-card"
              />
            )}

            {article.body && (
              <div className="mt-8">
                <ArticleBody markdown={article.body} />
              </div>
            )}

            {article.tags && article.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {article.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-bg-3 px-3 py-1 text-[12px] text-text-secondary"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {article.url && !article.url.startsWith('geowatch://') && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-block text-[13px] font-medium text-brand-text hover:underline"
              >
                Read the original source →
              </a>
            )}

            <div className="mt-8 border-t border-border/10 pt-6">
              <ShareBar title={article.title} />
            </div>

            <CommentsSection articleId={article.id} />
          </>
        )}
      </article>

      {article && (
        <div className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6">
          <RelatedStories currentId={article.id} category={article.category ?? null} />
        </div>
      )}

      <Footer />
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div>
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-4 h-10 w-full" />
      <div className="skeleton mt-2 h-10 w-2/3" />
      <div className="skeleton mt-6 h-16 w-full rounded-xl" />
      <div className="skeleton mt-8 aspect-[16/9] w-full rounded-2xl" />
      <div className="skeleton mt-8 h-4 w-full" />
      <div className="skeleton mt-2 h-4 w-full" />
      <div className="skeleton mt-2 h-4 w-4/5" />
    </div>
  );
}
