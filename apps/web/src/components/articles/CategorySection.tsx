'use client';

import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { ArticleCard } from './ArticleCard';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface CategorySectionProps {
  category: EventCategory;
  articles: Article[];
  onOpenArticle: (article: Article) => void;
  // 'grid' = block sits in a half-width column (blocks arranged two-up), so
  // its cards stay single-column; 'full' = block spans the whole feed.
  layout?: 'full' | 'grid';
}

/**
 * One category block on the homepage: a colored header, a featured lead
 * story (newest article, with its AI summary), then the rest of the
 * category's stories in a compact grid.
 */
export function CategorySection({
  category,
  articles,
  onOpenArticle,
  layout = 'full',
}: CategorySectionProps) {
  if (articles.length === 0) return null;

  const color = CATEGORY_COLOR[category];
  const [featured, ...rest] = articles;
  const restGridClass =
    layout === 'grid'
      ? 'grid grid-cols-1 gap-1'
      : 'grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3';

  return (
    <section className="mb-8">
      <div
        className="mb-3 flex items-center gap-2 border-b pb-1.5"
        style={{ borderColor: `${color}33` }}
      >
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <h2 className="text-sm font-semibold tracking-wide text-text-primary">
          {CATEGORY_LABEL[category]}
        </h2>
        <span className="text-[11px] text-text-tertiary">{articles.length}</span>
      </div>

      <button
        onClick={() => onOpenArticle(featured)}
        className="mb-3 flex w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-bg-3/50"
      >
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-bg-3 text-2xl">
          {featured.country?.flagEmoji ?? '🌐'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug text-text-primary">
            {featured.title}
          </div>
          {featured.aiSummary && (
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">
              {featured.aiSummary}
            </p>
          )}
          <div className="mt-1 text-[10px] text-text-tertiary">
            {featured.publishedAt && (
              <time dateTime={featured.publishedAt}>
                {formatRelativeTime(featured.publishedAt)}
              </time>
            )}
            {featured.country?.name && ` · ${featured.country.name}`}
          </div>
        </div>
      </button>

      {rest.length > 0 && (
        <div className={restGridClass}>
          {rest.map((a) => (
            <ArticleCard key={a.id} article={a} onSelect={() => onOpenArticle(a)} />
          ))}
        </div>
      )}
    </section>
  );
}
