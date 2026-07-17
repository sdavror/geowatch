'use client';

import { useEffect, useState } from 'react';
import type { AudienceAnalytics, ReferrerAnalytics, ViewsAnalytics } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { StatusBadge } from './StatusBadge';
import { AreaChart, BarList, DaysPicker } from '@/components/charts';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border/10 bg-bg-2 p-4">
      <div className="text-caption text-text-tertiary">{label}</div>
      <div className="mt-0.5 text-h1 tabular-nums text-text-primary">{value}</div>
      {hint && <div className="text-caption text-text-tertiary">{hint}</div>}
    </div>
  );
}

function useAnalytics<T>(path: string, days: number): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    authFetch<T>(`${path}?days=${days}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [path, days]);
  return { data, error };
}

export function ViewsSection({ onOpenArticleById }: { onOpenArticleById: (id: string) => void }) {
  const [days, setDays] = useState(30);
  const { data, error } = useAnalytics<ViewsAnalytics>('/admin/analytics/views', days);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-h1 text-text-primary">Views</h1>
        <DaysPicker value={days} onChange={setDays} />
      </div>
      {error && <p className="mb-3 text-caption text-status-conflict">{error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={`Article views (${days}d)`} value={data ? data.total.toLocaleString('en-US') : '—'} />
        <Tile
          label="vs previous period"
          value={data?.changePct != null ? `${data.changePct > 0 ? '+' : ''}${data.changePct}%` : '—'}
          hint={data?.changePct == null ? 'no baseline yet' : undefined}
        />
        <Tile
          label="Daily average"
          value={data ? Math.round(data.total / data.days).toLocaleString('en-US') : '—'}
        />
      </div>

      <section className="mb-5 rounded-2xl border border-border/10 bg-bg-2 p-4 text-text-primary">
        <h2 className="mb-2 text-h3 text-text-primary">Views per day</h2>
        {data ? <AreaChart data={data.daily.map((d) => ({ label: d.date, value: d.views }))} /> : null}
      </section>

      <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
        <h2 className="mb-3 text-h3 text-text-primary">Top stories</h2>
        <div className="flex flex-col gap-1">
          {data?.topArticles.map((a, i) => (
            <button
              key={a.id}
              onClick={() => onOpenArticleById(a.id)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-bg-3"
            >
              <span className="w-5 text-caption tabular-nums text-text-tertiary">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-body2 text-text-primary">{a.title}</span>
              <StatusBadge status={a.status} />
              <span className="w-14 text-right text-caption font-medium tabular-nums text-text-primary">
                {a.views.toLocaleString('en-US')}
              </span>
            </button>
          ))}
          {data && data.topArticles.length === 0 && (
            <p className="py-4 text-center text-caption text-text-tertiary">No article views in this period yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function AudienceSection() {
  const [days, setDays] = useState(30);
  const { data, error } = useAnalytics<AudienceAnalytics>('/admin/analytics/audience', days);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-h1 text-text-primary">Audience</h1>
        <DaysPicker value={days} onChange={setDays} />
      </div>
      {error && <p className="mb-3 text-caption text-status-conflict">{error}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={`Unique readers (${days}d)`} value={data ? data.uniqueVisitors.toLocaleString('en-US') : '—'} />
        <Tile label="Returning readers" value={data ? data.returningVisitors.toLocaleString('en-US') : '—'} hint="seen on 2+ days" />
        <Tile label="Views per reader" value={data ? String(data.viewsPerVisitor) : '—'} />
        <Tile label="Total page views" value={data ? data.totalViews.toLocaleString('en-US') : '—'} />
      </div>

      <section className="rounded-2xl border border-border/10 bg-bg-2 p-4 text-text-primary">
        <h2 className="mb-2 text-h3 text-text-primary">Unique readers per day</h2>
        {data ? (
          <AreaChart data={data.daily.map((d) => ({ label: d.date, value: d.visitors }))} color="#7C3AED" />
        ) : null}
      </section>

      <p className="mt-3 text-caption text-text-tertiary">
        A reader = a distinct anonymous session id. No accounts or tracking cookies are involved.
      </p>
    </div>
  );
}

export function TrafficSection() {
  const [days, setDays] = useState(30);
  const { data, error } = useAnalytics<ReferrerAnalytics>('/admin/analytics/referrers', days);

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-h1 text-text-primary">Traffic sources</h1>
        <DaysPicker value={days} onChange={setDays} />
      </div>
      {error && <p className="mb-3 text-caption text-status-conflict">{error}</p>}

      <section className="rounded-2xl border border-border/10 bg-bg-2 p-4">
        <h2 className="mb-3 text-h3 text-text-primary">Where readers come from</h2>
        {data ? (
          <BarList
            rows={data.sources.map((s) => ({
              label: s.source === 'direct' ? 'Direct / unknown' : s.source,
              value: s.views,
              hint: `${s.sharePct}%`,
            }))}
            color="#16A34A"
          />
        ) : null}
      </section>

      <p className="mt-3 text-caption text-text-tertiary">
        Referrer capture started with this release — older views count as “Direct / unknown”. Only the
        referring domain is stored, never full URLs.
      </p>
    </div>
  );
}
