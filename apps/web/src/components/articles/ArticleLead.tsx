'use client';

import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

export function ArticleLead({ article }: { article: Article }) {
  return (
    <div className="mb-4 border-b border-border/10 pb-4">
      {article.category && (
        <span
          className="text-[11px] font-medium"
          style={{ color: CATEGORY_COLOR[article.category as EventCategory] }}
        >
          {CATEGORY_LABEL[article.category as EventCategory]?.toUpperCase()}
        </span>
      )}
      <h1 className="mt-1 text-lg font-semibold leading-snug text-text-primary">{article.title}</h1>
      {article.aiSummary && (
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{article.aiSummary}</p>
      )}
      <div className="mt-2 text-[11px] text-text-tertiary">
        {formatRelativeTime(article.publishedAt)}
        {article.country?.name && ` · ${article.country.name}`}
      </div>
    </div>
  );
}
