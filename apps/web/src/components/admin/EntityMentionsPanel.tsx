'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/auth';

interface EntityMention {
  entityId: string;
  canonicalName: string;
  primaryCountryId: string | null;
  matchedText: string;
  sanctions: { regime: string; program: string }[];
}

/**
 * Sanctioned entities the resolution engine's keyword scan found in this
 * article — same lazy "click to load" shape as the neighboring
 * ResearchPanel. Reads GET /articles/:id/entities, which only has data once
 * the article has been saved at least once (scanForEntityMentions runs on
 * create/update in articles.service.ts) — before that, articleId is null
 * and there's nothing to show yet.
 */
export function EntityMentionsPanel({ articleId }: { articleId: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<EntityMention[] | null>(null);

  const load = async () => {
    if (!articleId) return;
    setOpen(true);
    setLoading(true);
    try {
      setMentions(await authFetch<EntityMention[]>(`/articles/${articleId}/entities`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entity mentions');
    } finally {
      setLoading(false);
    }
  };

  if (!articleId) {
    return (
      <div className="mt-3 rounded-xl border border-border/10 bg-bg-2 p-3">
        <h3 className="text-caption font-semibold text-text-primary">🏢 Sanctioned entities</h3>
        <p className="mt-1 text-[11px] text-text-tertiary">Save the story first to scan for entity mentions.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border/10 bg-bg-2 p-3">
      <button onClick={load} className="flex w-full items-center justify-between text-left">
        <h3 className="text-caption font-semibold text-text-primary">🏢 Sanctioned entities</h3>
        <span className="text-[11px] text-text-tertiary">{open ? '▲' : loading ? '…' : '📚 Scan'}</span>
      </button>

      {open && (
        <div className="mt-2">
          {loading && <p className="text-[11px] text-text-tertiary">Scanning…</p>}
          {error && <p className="text-[11px] text-status-conflict">{error}</p>}
          {mentions && mentions.length === 0 && (
            <p className="text-[11px] text-text-tertiary">No sanctioned entities found in the current text.</p>
          )}
          {mentions && mentions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {mentions.map((m) => (
                <div key={m.entityId} className="rounded-lg border border-border/10 bg-bg px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-text-primary">{m.canonicalName}</span>
                    {m.primaryCountryId && <span className="text-[10px] text-text-tertiary">{m.primaryCountryId}</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-tertiary">
                    matched &ldquo;{m.matchedText}&rdquo;
                    {m.sanctions.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-500/10 px-1.5 py-0.5 font-medium text-red-500">
                        {m.sanctions.map((s) => s.regime).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
