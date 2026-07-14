'use client';

import { useEffect, useState } from 'react';
import type { Source, MacroScoreEntry, OllamaStatus, HealthCheck } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

interface Counts {
  pending: number;
  published: number;
  total: number;
}

interface QuickAction {
  key: string;
  label: string;
  hint: string;
  path: string;
}

// Every button hits an endpoint that already exists on its own admin
// controller — this panel doesn't invent new backend behavior, just gives
// the existing cron-driven jobs a manual trigger + visible outcome.
const QUICK_ACTIONS: QuickAction[] = [
  { key: 'ingest', label: 'Run ingestion now', hint: 'Fetch all active RSS/Telegram sources', path: '/admin/sources/ingest' },
  { key: 'macro', label: 'Refresh macro data', hint: 'World Bank + IMF + sanctions + Country Health', path: '/admin/macro/refresh' },
  { key: 'trade', label: 'Refresh trade data', hint: 'UN Comtrade — runs in background, ~20-30 min', path: '/admin/macro/trade-refresh' },
  { key: 'energy', label: 'Refresh energy data', hint: 'EIA Brent/WTI/Henry Hub spot prices', path: '/admin/macro/energy-refresh' },
  { key: 'purge', label: 'Purge stale drafts', hint: 'Delete unreviewed pending drafts >14 days old', path: '/admin/sources/purge-stale' },
];

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color =
    tone === 'ok' ? 'text-status-stable' : tone === 'bad' ? 'text-status-conflict' : tone === 'warn' ? 'text-status-crisis' : 'text-text-primary';
  return (
    <div className="rounded-2xl border border-border/10 bg-bg-2 p-4">
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export function DashboardOverview() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [scores, setScores] = useState<MacroScoreEntry[]>([]);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ key: string; message: string } | null>(null);

  const load = async () => {
    const [c, s, sc, o, h] = await Promise.all([
      authFetch<Counts>('/admin/articles/counts').catch(() => null),
      authFetch<Source[]>('/admin/sources').catch(() => []),
      authFetch<MacroScoreEntry[]>('/macro/scores').catch(() => []),
      authFetch<OllamaStatus>('/admin/analysis/ollama-status').catch(() => null),
      authFetch<HealthCheck>('/health').catch(() => null),
    ]);
    setCounts(c);
    setSources(s);
    setScores(sc);
    setOllama(o);
    setHealth(h);
  };

  useEffect(() => {
    void load();
  }, []);

  const runAction = async (action: QuickAction) => {
    setRunningAction(action.key);
    setActionResult(null);
    try {
      const result = await authFetch<Record<string, unknown>>(action.path, { method: 'POST' });
      const summary = Object.entries(result)
        .filter(([k]) => k !== 'errors')
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : v}`)
        .join(' · ');
      setActionResult({ key: action.key, message: summary || 'Done' });
      await load();
    } catch (err) {
      setActionResult({ key: action.key, message: err instanceof Error ? err.message : 'Failed' });
    } finally {
      setRunningAction(null);
    }
  };

  const activeSources = sources.filter((s) => s.active).length;
  const lastFetch = sources
    .map((s) => s.lastFetched)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0];

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold text-text-primary">Dashboard</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Pending" value={counts ? String(counts.pending) : '—'} tone={counts && counts.pending > 0 ? 'warn' : undefined} />
        <StatCard label="Published" value={counts ? String(counts.published) : '—'} />
        <StatCard label="Sources active" value={sources.length ? `${activeSources}/${sources.length}` : '—'} />
        <StatCard label="Countries scored" value={scores.length ? String(scores.length) : '—'} />
        <StatCard
          label="Local LLM"
          value={ollama ? (ollama.reachable ? 'Online' : 'Offline') : '—'}
          tone={ollama ? (ollama.reachable ? 'ok' : 'bad') : undefined}
        />
        <StatCard
          label="API health"
          value={health ? health.status.toUpperCase() : '—'}
          tone={health ? (health.status === 'ok' ? 'ok' : 'bad') : undefined}
        />
      </div>

      {lastFetch && (
        <p className="mb-4 text-[12px] text-text-tertiary">
          Last ingestion activity: {formatRelativeTime(lastFetch)}
        </p>
      )}

      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        Quick actions
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <div key={action.key} className="rounded-xl border border-border/10 bg-bg-2 p-3.5">
            <div className="mb-1 text-[13px] font-medium text-text-primary">{action.label}</div>
            <div className="mb-3 text-[11px] text-text-tertiary">{action.hint}</div>
            <button
              onClick={() => runAction(action)}
              disabled={runningAction !== null}
              className="rounded-lg border border-border/10 bg-bg-3 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-4 disabled:opacity-50"
            >
              {runningAction === action.key ? 'Running…' : 'Run'}
            </button>
            {actionResult?.key === action.key && (
              <p className="mt-2 text-[11px] text-text-tertiary">{actionResult.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
