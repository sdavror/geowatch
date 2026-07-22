'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { EntityMergeReviewEntry } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

function EntitySide({
  name,
  countryId,
  aliases,
}: {
  name: string;
  countryId: string | null | undefined;
  aliases: string[] | undefined;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/10 bg-bg-3 px-3 py-2">
      <div className="truncate text-[12px] font-medium text-text-primary">{name}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
        {countryId && <span>{countryId}</span>}
        {aliases && aliases.length > 0 && <span className="truncate">{aliases.slice(0, 2).join(' · ')}</span>}
      </div>
    </div>
  );
}

export function EntityReviewsManager() {
  const [reviews, setReviews] = useState<EntityMergeReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<'auto-approve' | 'llm-pass' | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = async () => {
    try {
      setReviews(await authFetch<EntityMergeReviewEntry[]>('/admin/entity-resolution/reviews'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await authFetch(`/admin/entity-resolution/reviews/${id}/${action}`, { method: 'POST' });
      setReviews((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  };

  const runAutoApprove = async () => {
    setRunningAction('auto-approve');
    setActionResult(null);
    try {
      const res = await authFetch<{ scanned: number; approved: number; failed: number }>(
        '/admin/entity-resolution/reviews/auto-approve',
        { method: 'POST' },
      );
      setActionResult(`Auto-approve: ${res.approved}/${res.scanned} approved (${res.failed} failed).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-approve failed');
    } finally {
      setRunningAction(null);
    }
  };

  const runLlmPass = async () => {
    setRunningAction('llm-pass');
    setActionResult(null);
    try {
      const res = await authFetch<{
        scanned: number;
        approved: number;
        rejected: number;
        inconclusive: number;
        llmUnavailable: number;
      }>('/admin/entity-resolution/reviews/llm-second-pass', { method: 'POST' });
      setActionResult(
        `LLM pass: ${res.approved} approved, ${res.rejected} rejected, ${res.inconclusive} inconclusive of ${res.scanned}` +
          (res.llmUnavailable > 0 ? ` (${res.llmUnavailable} skipped — Ollama unreachable)` : ''),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LLM pass failed');
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-bold text-text-primary">Entity merge reviews</h1>
        <span className="text-[11px] text-text-tertiary">{reviews.length} pending</span>
      </div>
      <p className="mb-4 text-[11px] text-text-tertiary">
        Candidate duplicates the resolution engine found but wouldn&apos;t auto-merge — same company under two
        spellings vs. two genuinely distinct entities is a human call. A daily background pass already clears the
        safest tier automatically; use the buttons below to run it on demand.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={runAutoApprove}
          disabled={runningAction !== null}
          className="rounded-md border border-border/10 bg-bg-3 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {runningAction === 'auto-approve' ? 'Running…' : 'Auto-approve safe tier'}
        </button>
        <button
          onClick={runLlmPass}
          disabled={runningAction !== null}
          className="rounded-md border border-border/10 bg-bg-3 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {runningAction === 'llm-pass' ? 'Running…' : 'Run LLM second pass'}
        </button>
        {actionResult && <span className="text-[11px] text-text-tertiary">{actionResult}</span>}
      </div>

      {loading && <p className="text-xs text-text-tertiary">Loading…</p>}
      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
        className="flex flex-col gap-2"
      >
        {reviews.map((r) => (
          <motion.div
            key={r.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
            }}
            className="rounded-lg border border-border/10 bg-bg-2 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  r.confidence >= 90
                    ? 'bg-status-stable/15 text-status-stable'
                    : r.confidence >= 70
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-bg-3 text-text-tertiary'
                }`}
              >
                {Math.round(r.confidence)}% confidence
              </span>
              <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {r.matchedOn.method ?? 'unknown'} match
              </span>
              {r.matchedOn.llmSecondPassReasoning && (
                <span
                  className="truncate text-[10px] text-text-tertiary"
                  title={r.matchedOn.llmSecondPassReasoning}
                >
                  · {r.matchedOn.llmSecondPassReasoning}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <EntitySide
                name={r.entityA?.canonicalName ?? r.entityACanonicalName ?? 'Unknown'}
                countryId={r.entityA?.primaryCountryId}
                aliases={r.entityA?.aliases.map((a) => a.name)}
              />
              <span className="flex-shrink-0 text-[11px] text-text-tertiary">vs</span>
              <EntitySide
                name={r.entityB?.canonicalName ?? r.entityBCanonicalName ?? 'Unknown'}
                countryId={r.entityB?.primaryCountryId}
                aliases={r.entityB?.aliases.map((a) => a.name)}
              />
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => decide(r.id, 'reject')}
                disabled={busyId === r.id}
                className="rounded-md border border-border/10 bg-bg-3 px-3 py-1 text-[11px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
              >
                Not the same
              </button>
              <button
                onClick={() => decide(r.id, 'approve')}
                disabled={busyId === r.id}
                className="rounded-md bg-brand-bg px-3 py-1 text-[11px] font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
              >
                Merge
              </button>
            </div>
          </motion.div>
        ))}
        {reviews.length === 0 && !loading && !error && (
          <p className="py-8 text-center text-xs text-text-tertiary">Queue is clear — nothing needs a human.</p>
        )}
      </motion.div>
    </div>
  );
}
