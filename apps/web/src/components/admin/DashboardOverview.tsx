'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type {
  Article,
  DashboardStats,
  EventCategory,
  HealthCheck,
  OllamaStatus,
  Source,
} from '@geowatch/shared-types';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { StatusBadge } from './StatusBadge';
import { TaskList } from './TaskList';
import { CalendarGrid } from './CalendarGrid';

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
  { key: 'purge', label: 'Purge stale drafts', hint: 'Delete unreviewed ingested stories >14 days old', path: '/admin/sources/purge-stale' },
];

const cardSpring = { type: 'spring', stiffness: 450, damping: 34 } as const;

function StatCard({
  icon,
  iconBg,
  label,
  value,
  delta,
  deltaTone,
}: {
  icon: string;
  iconBg: string;
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
}) {
  const deltaColor =
    deltaTone === 'up' ? 'text-status-stable' : deltaTone === 'down' ? 'text-status-conflict' : 'text-text-tertiary';
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: cardSpring } }}
      className="flex items-start gap-3 rounded-2xl border border-border/10 bg-bg-2 p-4"
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[15px]"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-text-tertiary">{label}</div>
        <div className="text-xl font-bold tabular-nums text-text-primary">{value}</div>
        {delta && <div className={`text-[10px] font-medium ${deltaColor}`}>{delta}</div>}
      </div>
    </motion.div>
  );
}

function formatViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface DashboardOverviewProps {
  onOpenArticle: (article: Article) => void;
  onCreate: () => void;
  onGotoArticles: () => void;
  onGotoTasks: () => void;
}

export function DashboardOverview({ onOpenArticle, onCreate, onGotoArticles, onGotoTasks }: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Article[]>([]);
  const [drafts, setDrafts] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [ollama, setOllama] = useState<OllamaStatus | null>(null);
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ key: string; message: string } | null>(null);

  const load = useCallback(async () => {
    const [st, all, dr, s, o, h] = await Promise.all([
      authFetch<DashboardStats>('/admin/dashboard/stats').catch(() => null),
      authFetch<Article[]>('/admin/articles').catch(() => []),
      authFetch<Article[]>('/admin/articles?status=draft').catch(() => []),
      authFetch<Source[]>('/admin/sources').catch(() => []),
      authFetch<OllamaStatus>('/admin/analysis/ollama-status').catch(() => null),
      authFetch<HealthCheck>('/health').catch(() => null),
    ]);
    setStats(st);
    setRecent(all.slice(0, 5));
    setDrafts(dr.slice(0, 3));
    setSources(s);
    setOllama(o);
    setHealth(h);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const sc = stats?.statusCounts;

  return (
    <div>
      {/* ── Stat cards ─────────────────────────────────── */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <StatCard
          icon="📄"
          iconBg="#DBEAFE"
          label="Published"
          value={sc ? String(sc.published) : '—'}
          delta={stats ? `+${stats.weeklyNew.published} this week` : undefined}
          deltaTone={stats && stats.weeklyNew.published > 0 ? 'up' : 'flat'}
        />
        <StatCard
          icon="✏️"
          iconBg="#FEF9C3"
          label="Drafts"
          value={sc ? String(sc.draft + sc.idea) : '—'}
          delta={stats ? `+${stats.weeklyNew.drafts} this week` : undefined}
          deltaTone="flat"
        />
        <StatCard
          icon="🔍"
          iconBg="#EDE9FE"
          label="In review"
          value={sc ? String(sc.in_review) : '—'}
          delta={sc && sc.in_review > 0 ? 'Awaiting moderation' : 'Queue clear'}
          deltaTone={sc && sc.in_review > 0 ? 'down' : 'up'}
        />
        <StatCard
          icon="📆"
          iconBg="#DCFCE7"
          label="Scheduled"
          value={sc ? String(sc.scheduled) : '—'}
          delta={sc && sc.ready > 0 ? `${sc.ready} ready to publish` : undefined}
          deltaTone="flat"
        />
        <StatCard
          icon="📈"
          iconBg="#FEE2E2"
          label="Views (30 days)"
          value={stats ? formatViews(stats.views30d) : '—'}
          delta={
            stats?.viewsChangePct != null
              ? `${stats.viewsChangePct > 0 ? '+' : ''}${stats.viewsChangePct}%`
              : undefined
          }
          deltaTone={stats?.viewsChangePct != null ? (stats.viewsChangePct >= 0 ? 'up' : 'down') : 'flat'}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* ── Left 2/3: recent + drafts ───────────────── */}
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-2">
          <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-text-primary">Recent stories</h2>
              <button onClick={onGotoArticles} className="text-[11px] font-medium text-brand-text hover:underline">
                View all
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {recent.map((a) => {
                const thumb = mediaUrl(a.imageUrl);
                return (
                  <button
                    key={a.id}
                    onClick={() => onOpenArticle(a)}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg-3"
                  >
                    <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-base">{a.country?.flagEmoji ?? '🌐'}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-text-primary">{a.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-tertiary">
                        {a.category && (
                          <span style={{ color: CATEGORY_COLOR[a.category as EventCategory] }}>
                            {CATEGORY_LABEL[a.category as EventCategory]}
                          </span>
                        )}
                        <span>{formatRelativeTime(a.publishedAt ?? a.createdAt ?? null)}</span>
                      </div>
                    </div>
                    {a.status && <StatusBadge status={a.status} />}
                  </button>
                );
              })}
              {recent.length === 0 && (
                <p className="py-6 text-center text-[12px] text-text-tertiary">No stories yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-text-primary">Drafts</h2>
              <button onClick={onGotoArticles} className="text-[11px] font-medium text-brand-text hover:underline">
                View all
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {drafts.map((d) => {
                const thumb = mediaUrl(d.imageUrl);
                return (
                  <button
                    key={d.id}
                    onClick={() => onOpenArticle(d)}
                    className="group overflow-hidden rounded-xl border border-border/10 bg-bg text-left transition-shadow hover:shadow-md"
                  >
                    <div className="flex h-20 items-center justify-center overflow-hidden bg-bg-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <span className="text-xl">{d.country?.flagEmoji ?? '📝'}</span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="line-clamp-2 text-[12px] leading-snug text-text-primary">{d.title}</div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] text-text-tertiary">
                          {formatRelativeTime(d.createdAt ?? null)}
                        </span>
                        <StatusBadge status="draft" />
                      </div>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={onCreate}
                className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/20 text-text-tertiary transition-colors hover:border-brand hover:text-brand-text"
              >
                <span className="text-xl leading-none">+</span>
                <span className="text-[11px]">New draft</span>
              </button>
            </div>
          </section>
        </div>

        {/* ── Right 1/3: tasks + calendar ─────────────── */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-text-primary">My tasks</h2>
              <button onClick={onGotoTasks} className="text-[11px] font-medium text-brand-text hover:underline">
                View all
              </button>
            </div>
            <TaskList compact />
          </section>

          <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
            <h2 className="mb-1 text-[14px] font-bold text-text-primary">Publication calendar</h2>
            <CalendarGrid compact />
          </section>
        </div>
      </div>

      {/* ── System & data (pre-existing ops features) ── */}
      <section className="mt-6 rounded-2xl border border-border/10 bg-bg-2 p-4">
        <button
          onClick={() => setSystemOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-[14px] font-bold text-text-primary">System & data</h2>
          <span className="flex items-center gap-3 text-[11px] text-text-tertiary">
            <span>
              Sources {sources.length ? `${activeSources}/${sources.length}` : '—'} · LLM{' '}
              <span className={ollama?.reachable ? 'text-status-stable' : 'text-status-conflict'}>
                {ollama ? (ollama.reachable ? 'online' : 'offline') : '—'}
              </span>{' '}
              · API{' '}
              <span className={health?.status === 'ok' ? 'text-status-stable' : 'text-status-conflict'}>
                {health ? health.status.toUpperCase() : '—'}
              </span>
            </span>
            <span>{systemOpen ? '▴' : '▾'}</span>
          </span>
        </button>

        {systemOpen && (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <div key={action.key} className="rounded-xl border border-border/10 bg-bg p-3.5">
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
        )}
      </section>
    </div>
  );
}
