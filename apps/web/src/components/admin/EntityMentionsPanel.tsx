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

interface EntitySearchResult {
  id: string;
  canonicalName: string;
  aliases: string[];
  sanctionCount: number;
}

/**
 * Sanctioned entities the resolution engine's keyword scan found in this
 * article — same lazy "click to load" shape as the neighboring
 * ResearchPanel. Reads GET /articles/:id/entities, which only has data once
 * the article has been saved at least once (scanForEntityMentions runs on
 * create/update in articles.service.ts) — before that, articleId is null
 * and there's nothing to show yet.
 *
 * Also doubles as a search-and-cite tool: `onInsert` lets the editor look up
 * ANY sanctioned entity (not just already-detected mentions) and drop a
 * link to its public profile page at the cursor — same shape as the
 * existing "insert related story" action.
 */
export function EntityMentionsPanel({
  articleId,
  onInsert,
}: {
  articleId: string | null;
  onInsert: (markdown: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<EntityMention[] | null>(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<EntitySearchResult[] | null>(null);

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

  const search = async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      setResults(await authFetch<EntitySearchResult[]>(`/entities?q=${encodeURIComponent(q.trim())}`));
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const insert = (r: EntitySearchResult) => {
    onInsert(`[${r.canonicalName}](/entities/${r.id})`);
    setQuery('');
    setResults(null);
  };

  return (
    <div className="mt-3 rounded-xl border border-border/10 bg-bg-2 p-3">
      {articleId ? (
        <button onClick={load} className="flex w-full items-center justify-between text-left">
          <h3 className="text-caption font-semibold text-text-primary">🏢 Sanctioned entities</h3>
          <span className="text-[11px] text-text-tertiary">{open ? '▲' : loading ? '…' : '📚 Scan'}</span>
        </button>
      ) : (
        <h3 className="text-caption font-semibold text-text-primary">🏢 Sanctioned entities</h3>
      )}

      {articleId && open && (
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

      <div className="mt-2.5 border-t border-border/10 pt-2.5">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            void search(e.target.value);
          }}
          placeholder="Search a company to cite…"
          className="w-full rounded-lg border border-border/10 bg-bg px-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
        />
        {searching && <p className="mt-1 text-[11px] text-text-tertiary">Searching…</p>}
        {results && results.length === 0 && !searching && (
          <p className="mt-1 text-[11px] text-text-tertiary">No entities found.</p>
        )}
        {results && results.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => insert(r)}
                title="Insert as a link to its public profile at the cursor"
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] text-text-primary hover:bg-bg-3"
              >
                <span className="truncate">{r.canonicalName}</span>
                {r.sanctionCount > 0 && (
                  <span className="ml-2 flex-shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                    {r.sanctionCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
