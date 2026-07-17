'use client';

import { motion } from 'framer-motion';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface StoryCardProps {
  article: Article;
  onOpen: (a: Article) => void;
  // 'medium' = full 16:9 media card (default, the prior only look).
  // 'compact' = dense row, no media — used to weight down secondary items
  // in a grid so the block as a whole doesn't compete with the page Hero.
  size?: 'medium' | 'compact';
}

// Shared entrance variant so cards rise into view in a stagger; the parent
// controls timing via a `staggerChildren` container.
export const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// Parent container that reveals its StoryCard children in a gentle stagger.
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

/**
 * Reusable premium story card. Framer Motion adds a spring hover-lift and
 * tap feedback. Used in related stories, recommendations, and category
 * grids — size controls how much visual weight it carries in a mixed grid.
 */
export function StoryCard({ article, onOpen, size = 'medium' }: StoryCardProps) {
  const img = mediaUrl(article.imageUrl);
  const cat = article.category as EventCategory | null;

  if (size === 'compact') {
    return (
      <motion.button
        variants={cardVariants}
        whileTap={{ scale: 0.98 }}
        onClick={() => onOpen(article)}
        className="group flex w-full gap-3 rounded-xl border border-border/10 bg-bg-2 p-3 text-left transition-colors hover:bg-bg-3/50"
      >
        <div className="flex h-12 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-bg-3 text-xl">
          {article.country?.flagEmoji ?? '🌐'}
        </div>
        <div className="min-w-0 flex-1">
          {cat && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: CATEGORY_COLOR[cat] }}
            >
              {CATEGORY_LABEL[cat]}
            </span>
          )}
          <h3 className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-text-primary transition-colors group-hover:text-brand-text">
            {article.title}
          </h3>
          <div className="mt-1 text-[11px] text-text-tertiary">
            {article.country?.name && <span>{article.country.name} · </span>}
            {formatRelativeTime(article.publishedAt)}
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      variants={cardVariants}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      onClick={() => onOpen(article)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border/10 bg-bg-2 text-left shadow-card hover:shadow-pop"
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
    </motion.button>
  );
}
