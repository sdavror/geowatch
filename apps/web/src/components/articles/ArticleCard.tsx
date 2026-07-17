'use client';

import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { ContentTypeBadge } from '@/components/article/ContentTypeBadge';

interface ArticleCardProps {
  article: Article;
  onSelect?: (id: string) => void;
}

export function ArticleCard({ article, onSelect }: ArticleCardProps) {
  return (
    <button
      onClick={() => onSelect?.(article.id)}
      className="flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-bg-3/50"
    >
      <div className="flex h-10 w-12 flex-shrink-0 items-center justify-center rounded-md bg-bg-3 text-lg">
        {article.country?.flagEmoji ?? '🌐'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <ContentTypeBadge type={article.contentType} />
          {article.category && (
            <span
              className="text-[11px] font-medium"
              style={{ color: CATEGORY_COLOR[article.category as EventCategory] }}
            >
              {CATEGORY_LABEL[article.category as EventCategory]?.toUpperCase()}
            </span>
          )}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-text-primary">
          {article.title}
        </div>
        <div className="mt-1 text-[11px] text-text-tertiary">
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {formatRelativeTime(article.publishedAt)}
            </time>
          )}
        </div>
      </div>
    </button>
  );
}
