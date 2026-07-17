'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Article } from '@geowatch/shared-types';
import { useArticles } from '@/hooks/useArticles';
import { Navbar } from '@/components/nav/Navbar';
import { Footer } from '@/components/nav/Footer';
import { StoryCard, staggerContainer } from '@/components/article/StoryCard';

/**
 * "Blog" in the footer = the newsroom's own long-form output: the latest
 * stories across every section in one chronological wall, no hero, no
 * sidebar — for readers who just want everything new.
 */
export default function BlogPage() {
  const router = useRouter();
  const { articles, isLoading } = useArticles({ limit: 30 });

  const open = (a: Article) => router.push(`/news/${a.id}`);

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
        <h1 className="text-display text-text-primary">Latest from Apolitics</h1>
        <p className="mt-2 text-body1 text-text-secondary">
          Every story across every section, newest first.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {articles.map((a) => (
              <StoryCard key={a.id} article={a} onOpen={open} />
            ))}
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}
