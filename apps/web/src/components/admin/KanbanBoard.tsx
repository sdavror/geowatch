'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Article, ArticleStatus, EventCategory } from '@geowatch/shared-types';
import { ARTICLE_STATUS_LABEL, CATEGORY_COLOR, CATEGORY_LABEL } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { STATUS_ACCENT } from './StatusBadge';

// Board columns per the design ("Editorial process"): idea → published.
// Scheduled/archived live in the Articles list, not on the board — the board
// is for work in motion.
const COLUMNS: ArticleStatus[] = ['idea', 'draft', 'in_review', 'ready', 'published'];

// Published accumulates forever; the board only needs the recent tail.
const PUBLISHED_DISPLAY_CAP = 12;

interface KanbanBoardProps {
  onOpenArticle: (article: Article) => void;
}

export function KanbanBoard({ onOpenArticle }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Record<ArticleStatus, Article[]>>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ArticleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [lists, c] = await Promise.all([
        Promise.all(COLUMNS.map((s) => authFetch<Article[]>(`/admin/articles?status=${s}`))),
        authFetch<{ byStatus: Record<string, number> }>('/admin/articles/counts'),
      ]);
      const next = {} as Record<ArticleStatus, Article[]>;
      COLUMNS.forEach((s, i) => {
        next[s] = s === 'published' ? lists[i].slice(0, PUBLISHED_DISPLAY_CAP) : lists[i];
      });
      setColumns(next);
      setCounts(c.byStatus ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (articleId: string, to: ArticleStatus) => {
    try {
      await authFetch(`/admin/articles/${articleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: to }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move story');
    }
  };

  const handleDrop = (to: ArticleStatus) => {
    if (dragId) void move(dragId, to);
    setDragId(null);
    setDragOver(null);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-h1 text-text-primary">Kanban: editorial process</h1>
        <span className="text-[11px] text-text-tertiary">Drag a card between columns, or use ‹ ›</span>
      </div>
      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((status, colIdx) => {
          const cards = columns?.[status] ?? [];
          const totalCount = counts[status] ?? cards.length;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((v) => (v === status ? null : v))}
              onDrop={() => handleDrop(status)}
              className={`flex w-64 flex-shrink-0 flex-col rounded-2xl border bg-bg-2 p-2.5 transition-colors ${
                dragOver === status ? 'border-brand bg-brand-bg/40' : 'border-border/10'
              }`}
            >
              <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: STATUS_ACCENT[status] }}
                />
                <span className="text-[12px] font-semibold text-text-primary">
                  {status === 'idea' ? 'Ideas' : ARTICLE_STATUS_LABEL[status]}
                </span>
                <span className="ml-auto rounded-full bg-bg-3 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text-tertiary">
                  {totalCount}
                </span>
              </div>

              <div className="flex min-h-24 flex-col gap-2">
                {cards.map((a) => (
                  <motion.div
                    key={a.id}
                    layout
                    draggable
                    onDragStart={() => setDragId(a.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOver(null);
                    }}
                    transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                    className={`cursor-grab rounded-xl border border-border/10 bg-bg p-3 shadow-sm active:cursor-grabbing ${
                      dragId === a.id ? 'opacity-50' : ''
                    }`}
                    style={{ borderLeft: `3px solid ${STATUS_ACCENT[status]}` }}
                  >
                    <button
                      onClick={() => onOpenArticle(a)}
                      className="block w-full text-left text-[12px] leading-snug text-text-primary hover:text-brand-text"
                    >
                      {a.title}
                    </button>
                    <div className="mt-2 flex items-center gap-1.5">
                      {a.category && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{
                            color: CATEGORY_COLOR[a.category as EventCategory],
                            backgroundColor: `${CATEGORY_COLOR[a.category as EventCategory]}1A`,
                          }}
                        >
                          {CATEGORY_LABEL[a.category as EventCategory]}
                        </span>
                      )}
                      {a.country?.flagEmoji && <span className="text-[11px]">{a.country.flagEmoji}</span>}
                      <span className="ml-auto flex items-center gap-1">
                        {colIdx > 0 && (
                          <button
                            onClick={() => move(a.id, COLUMNS[colIdx - 1])}
                            title={`Move to ${ARTICLE_STATUS_LABEL[COLUMNS[colIdx - 1]]}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-text-tertiary hover:bg-bg-3 hover:text-text-primary"
                          >
                            ‹
                          </button>
                        )}
                        {colIdx < COLUMNS.length - 1 && (
                          <button
                            onClick={() => move(a.id, COLUMNS[colIdx + 1])}
                            title={`Move to ${ARTICLE_STATUS_LABEL[COLUMNS[colIdx + 1]]}`}
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-text-tertiary hover:bg-bg-3 hover:text-text-primary"
                          >
                            ›
                          </button>
                        )}
                      </span>
                    </div>
                  </motion.div>
                ))}
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/20 py-6 text-center text-[11px] text-text-tertiary">
                    Empty
                  </div>
                )}
                {status === 'published' && totalCount > cards.length && (
                  <div className="px-1 text-center text-[10px] text-text-tertiary">
                    +{totalCount - cards.length} more published
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
