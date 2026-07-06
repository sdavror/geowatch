'use client';

import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface StoryCardProps {
  article: Article;
  onOpen: (a: Article) => void;
}

/**
 * Reusable premium story card: 16:9 media, category tag, headline, meta.
 * Used in related stories, recommendations, and category grids.
 */
export function StoryCard({ article, onOpen }: StoryCardProps) {
  const img = mediaUrl(article.imageUrl);
  const cat = article.category as EventCategory | null;

  return (
    <button
      onClick={() => onOpen(article)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/10 bg-bg-2 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-bg-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            {article.country?.flagEmoji ?? '🌐'}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {cat && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: CATEGORY_COLOR[cat] }}
          >
            {CATEGORY_LABEL[cat]}
          </span>
        )}
        <h3 className="mt-1.5 text-[16px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-brand-text">
          {article.title}
        </h3>
        <div className="mt-auto pt-3 text-[11px] text-text-tertiary">
          {article.country?.name && <span>{article.country.name} · </span>}
          {formatRelativeTime(article.publishedAt)}
        </div>
      </div>
    </button>
  );
}
