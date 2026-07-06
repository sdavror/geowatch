'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { fetcher, mediaUrl } from '@/lib/api';
import { CommentsSection } from '@/components/articles/CommentsSection';
import { Logo } from '@/components/Logo';
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
        <Logo />
        <Link href="/" className="text-[12px] text-text-tertiary hover:text-brand-text">
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
                className="text-[12px] font-medium"
                style={{ color: CATEGORY_COLOR[article.category as EventCategory] }}
              >
                {CATEGORY_LABEL[article.category as EventCategory]?.toUpperCase()}
              </span>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-tight text-text-primary">
              {article.title}
            </h1>
            <div className="mt-2 text-[12px] text-text-tertiary">
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
              <p className="mt-4 text-[16px] font-medium leading-relaxed text-text-secondary">
                {article.aiSummary}
              </p>
            )}
            {/* Long-form body reads in Lora (serif) at a book-like measure —
                17px with a 1.75 line height. */}
            {article.body && (
              <div className="mt-5 whitespace-pre-wrap font-serif text-[17px] leading-[1.75] text-text-primary">
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
