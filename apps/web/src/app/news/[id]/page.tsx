'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { fetcher, mediaUrl } from '@/lib/api';
import { CommentsSection } from '@/components/articles/CommentsSection';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

export default function NewsDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  const { data: article, error, isLoading } = useSWR<Article>(
    id ? `/articles/${id}` : null,
    fetcher,
  );

  const image = mediaUrl(article?.imageUrl);

  return (
    <main className="min-h-screen bg-bg">
      <header className="flex h-12 items-center gap-4 border-b border-border/10 bg-bg-2/70 px-5 backdrop-blur-xl">
        <Link href="/" className="text-[15px] font-semibold tracking-wide text-text-primary">
          GeoWatch
        </Link>
        <Link href="/" className="text-[11px] text-text-tertiary hover:text-text-secondary">
          ← Back to feed
        </Link>
      </header>

      <article className="mx-auto max-w-2xl px-5 py-8">
        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
          </div>
        )}
        {error && <p className="text-xs text-status-conflict">Story not found.</p>}

        {article && (
          <>
            {article.category && (
              <span
                className="text-[11px] font-medium"
                style={{ color: CATEGORY_COLOR[article.category as EventCategory] }}
              >
                {CATEGORY_LABEL[article.category as EventCategory]?.toUpperCase()}
              </span>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-tight text-text-primary">
              {article.title}
            </h1>
            <div className="mt-2 text-[11px] text-text-tertiary">
              {article.publishedAt && (
                <time dateTime={article.publishedAt}>{formatRelativeTime(article.publishedAt)}</time>
              )}
              {article.country?.name && ` · ${article.country.name}`}
            </div>

            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="mt-4 w-full rounded-2xl border border-border/10 object-cover"
              />
            )}

            {article.aiSummary && (
              <p className="mt-4 text-[15px] font-medium leading-relaxed text-text-secondary">
                {article.aiSummary}
              </p>
            )}
            {article.body && (
              <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text-primary">
                {article.body}
              </div>
            )}

            {article.url && !article.url.startsWith('geowatch://') && (
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-xs text-brand-text hover:underline"
              >
                Read the original source →
              </a>
            )}

            <CommentsSection articleId={article.id} />
          </>
        )}
      </article>
    </main>
  );
}
