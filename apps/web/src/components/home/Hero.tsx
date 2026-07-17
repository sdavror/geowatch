'use client';

import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { ContentTypeBadge } from '@/components/article/ContentTypeBadge';

interface HeroProps {
  lead: Article;
  secondary: Article[]; // up to 2 supporting stories
  onOpen: (a: Article) => void;
}

function CategoryTag({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  const c = category as EventCategory;
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider"
      style={{ color: CATEGORY_COLOR[c] }}
    >
      {CATEGORY_LABEL[c]}
    </span>
  );
}

/**
 * Front-page hero: one dominant lead story with its image, flanked by up to
 * two supporting headlines — the classic broadsheet above-the-fold layout.
 */
export function Hero({ lead, secondary, onOpen }: HeroProps) {
  const img = mediaUrl(lead.imageUrl);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <button
        onClick={() => onOpen(lead)}
        className="group col-span-1 text-left lg:col-span-2"
      >
        <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl bg-bg-3">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl">
              {lead.country?.flagEmoji ?? '🌐'}
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <ContentTypeBadge type={lead.contentType} />
            <CategoryTag category={lead.category} />
          </div>
          <h2 className="mt-2 text-3xl font-bold leading-[1.15] tracking-tight text-text-primary transition-colors group-hover:text-brand-text sm:text-[34px]">
            {lead.title}
          </h2>
          {lead.aiSummary && (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-secondary">
              {lead.aiSummary}
            </p>
          )}
          <div className="mt-3 text-[12px] text-text-tertiary">
            {lead.country?.name && <span>{lead.country.name} · </span>}
            {formatRelativeTime(lead.publishedAt)}
          </div>
        </div>
      </button>

      <div className="flex flex-col divide-y divide-border/10 border-border/10 lg:border-l lg:pl-6">
        {secondary.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen(a)}
            className="group py-4 text-left first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <ContentTypeBadge type={a.contentType} />
              <CategoryTag category={a.category} />
            </div>
            <h3 className="mt-1.5 text-[18px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-brand-text">
              {a.title}
            </h3>
            <div className="mt-2 text-[12px] text-text-tertiary">
              {formatRelativeTime(a.publishedAt)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
