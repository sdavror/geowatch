'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { Article } from '@geowatch/shared-types';
import { useArticles } from '@/hooks/useArticles';
import { StoryCard, staggerContainer } from './StoryCard';

const PAGE = 6;

/**
 * Related stories (same category) plus an infinite-scrolling "More from
 * Apolitics" feed. Reveals another page each time the sentinel enters view.
 */
export function RelatedStories({ currentId, category }: { currentId: string; category: string | null }) {
  const router = useRouter();
  const { articles } = useArticles();
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const open = (a: Article) => router.push(`/news/${a.id}`);

  const related = useMemo(
    () => articles.filter((a) => a.id !== currentId && a.category === category).slice(0, 3),
    [articles, currentId, category],
  );

  const more = useMemo(() => {
    const relatedIds = new Set(related.map((a) => a.id));
    return articles.filter((a) => a.id !== currentId && !relatedIds.has(a.id));
  }, [articles, currentId, related]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShown((n) => Math.min(n + PAGE, more.length));
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more.length]);

  return (
    <div className="mt-14">
      {related.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-5 text-[20px] font-bold tracking-tight text-text-primary">Related stories</h2>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {related.map((a) => (
              <StoryCard key={a.id} article={a} onOpen={open} />
            ))}
          </motion.div>
        </section>
      )}

      <section>
        <h2 className="mb-5 text-[20px] font-bold tracking-tight text-text-primary">More from Apolitics</h2>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {more.slice(0, shown).map((a) => (
            <StoryCard key={a.id} article={a} onOpen={open} />
          ))}
        </motion.div>
        {shown < more.length && <div ref={sentinel} className="h-10" />}
      </section>
    </div>
  );
}
