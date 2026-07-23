'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { PersonMergeReviewEntry, PersonReviewSide as PersonReviewSideData } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

const ROLE_LABEL: Record<string, string> = {
  director: 'Director',
  beneficial_owner: 'Beneficial owner',
  officer: 'Officer',
};

function PersonSide({
  person,
  fallbackName,
}: {
  person: PersonReviewSideData | null | undefined;
  fallbackName: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/10 bg-bg-3 px-3 py-2">
      <div className="truncate text-[12px] font-medium text-text-primary">{person?.canonicalName ?? fallbackName}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-tertiary">
        {person?.primaryCountryId && <span>{person.primaryCountryId}</span>}
        {person && person.aliases.length > 0 && (
          <span className="truncate">{person.aliases.slice(0, 2).map((a) => a.name).join(' · ')}</span>
        )}
      </div>
      {/* Which companies this person is an officer of, and whether those are
          sanctioned (regime = whose list, program = the stated basis) — the
          context a reviewer actually needs to judge "is this the same person". */}
      {person && person.officerRoles.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          {person.officerRoles.map(({ role, entity }, idx) => (
            <div key={`${entity.id}-${idx}`} className="flex items-center gap-1.5 text-[10px]">
              <span className="truncate text-text-secondary">{entity.canonicalName}</span>
              <span className="flex-shrink-0 text-text-tertiary">· {ROLE_LABEL[role] ?? role}</span>
              {entity.sanctions.length > 0 && (
                <span
                  className="flex-shrink-0 rounded-full bg-status-conflict/15 px-1.5 py-0.5 font-semibold text-status-conflict"
                  title={entity.sanctions.map((s) => `${s.regime}: ${s.program}`).join(' · ')}
                >
                  ⚠ {entity.sanctions.length} sanction{entity.sanctions.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PersonReviewsManager() {
  const [reviews, setReviews] = useState<PersonMergeReviewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<'backfill' | 'llm-pass' | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = async () => {
    try {
      setReviews(await authFetch<PersonMergeReviewEntry[]>('/admin/entity-resolution/person-reviews'));
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
      await authFetch(`/admin/entity-resolution/person-reviews/${id}/${action}`, { method: 'POST' });
      setReviews((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  };

  const runBackfill = async () => {
    setRunningAction('backfill');
    setActionResult(null);
    try {
      const res = await authFetch<{ scanned: number; resolved: number }>(
        '/admin/entity-resolution/persons/backfill',
        { method: 'POST' },
      );
      setActionResult(`Backfill: ${res.resolved}/${res.scanned} officer rows resolved to a person.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setRunningAction(null);
    }
  };

  const runLlmPass = async () => {
    setRunningAction('llm-pass');
    setActionResult(null);
    try {
      const res = await authFetch<{ scanned: number; rejected: number; inconclusive: number; llmUnavailable: number }>(
        '/admin/entity-resolution/person-reviews/llm-second-pass',
        { method: 'POST' },
      );
      setActionResult(
        `LLM pass: ${res.rejected} auto-rejected, ${res.inconclusive} left for a human, of ${res.scanned}` +
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
        <h1 className="text-lg font-bold text-text-primary">Person merge reviews</h1>
        <span className="text-[11px] text-text-tertiary">{reviews.length} pending</span>
      </div>
      <p className="mb-4 text-[11px] text-text-tertiary">
        Candidate duplicate officers across different companies — a much riskier call than merging companies (common
        names collide far more easily), so unlike entity reviews there is no auto-approve tier here: every merge
        needs a human. The LLM pass can only auto-reject a clear non-match.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={runBackfill}
          disabled={runningAction !== null}
          className="rounded-md border border-border/10 bg-bg-3 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {runningAction === 'backfill' ? 'Running…' : 'Run backfill'}
        </button>
        <button
          onClick={runLlmPass}
          disabled={runningAction !== null}
          className="rounded-md border border-border/10 bg-bg-3 px-3 py-1.5 text-[11px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {runningAction === 'llm-pass' ? 'Running…' : 'Run LLM second pass (auto-reject only)'}
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
                      ? 'bg-status-unstable/20 text-status-unstable'
                      : 'bg-bg-3 text-text-tertiary'
                }`}
              >
                {Math.round(r.confidence)}% confidence
              </span>
              <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                {r.matchedOn.method ?? 'unknown'} match
              </span>
              {r.matchedOn.role && (
                <span className="text-[10px] uppercase tracking-wide text-text-tertiary">· {r.matchedOn.role}</span>
              )}
              {r.matchedOn.llmSecondPassReasoning && (
                <span
                  className="truncate text-[10px] text-text-tertiary"
                  title={r.matchedOn.llmSecondPassReasoning}
                >
                  · {r.matchedOn.llmSecondPassReasoning}
                </span>
              )}
            </div>

            <div className="flex items-start gap-2">
              <PersonSide person={r.personA} fallbackName={r.personACanonicalName ?? 'Unknown'} />
              <span className="mt-2 flex-shrink-0 text-[11px] text-text-tertiary">vs</span>
              <PersonSide person={r.personB} fallbackName={r.personBCanonicalName ?? 'Unknown'} />
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
