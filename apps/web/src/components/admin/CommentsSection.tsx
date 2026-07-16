'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { AdminComment } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

/** Site-wide comment moderation: latest comments with article context. */
export function CommentsSection() {
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setComments(await authFetch<AdminComment[]>('/admin/comments'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm('Delete this comment permanently?')) return;
    try {
      await authFetch(`/admin/comments/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-h1 text-text-primary">Comments</h1>
      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
        className="flex max-w-3xl flex-col gap-1.5"
      >
        {comments.map((c) => {
          const avatar = mediaUrl(c.author.avatarUrl);
          return (
            <motion.div
              key={c.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
              }}
              className="group rounded-xl border border-border/10 bg-bg-2 px-3.5 py-3"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-4 text-[10px] font-semibold text-text-secondary">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    c.author.name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="text-[12px] font-medium text-text-primary">{c.author.name}</span>
                <span className="text-[11px] text-text-tertiary">{formatRelativeTime(c.createdAt)}</span>
                <button
                  onClick={() => remove(c.id)}
                  className="ml-auto text-[11px] text-text-tertiary opacity-0 transition-opacity hover:text-status-conflict group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>
              <p className="whitespace-pre-wrap text-[13px] text-text-secondary">{c.body}</p>
              <Link
                href={`/news/${c.article.id}`}
                target="_blank"
                className="mt-1.5 block truncate text-[11px] text-brand-text hover:underline"
              >
                on: {c.article.title}
              </Link>
            </motion.div>
          );
        })}
        {comments.length === 0 && !error && (
          <p className="py-8 text-center text-xs text-text-tertiary">No comments yet.</p>
        )}
      </motion.div>
    </div>
  );
}
