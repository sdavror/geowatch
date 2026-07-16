'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ArticleStatus, CalendarEntry } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { StatusBadge, StatusDot, STATUS_ACCENT } from './StatusBadge';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Legend groups per the design: published / scheduled / draft-stage work.
const LEGEND: Array<{ label: string; status: ArticleStatus }> = [
  { label: 'Published', status: 'published' },
  { label: 'Scheduled', status: 'scheduled' },
  { label: 'In progress', status: 'draft' },
];

/** Collapses working stages into one dot color so a day cell stays readable. */
function dotStatus(status: ArticleStatus): ArticleStatus {
  return status === 'published' || status === 'scheduled' ? status : 'draft';
}

interface CalendarGridProps {
  /** Compact: dashboard widget — dots only, no day-detail panel. */
  compact?: boolean;
  onOpenArticle?: (id: string) => void;
}

export function CalendarGrid({ compact = false, onOpenArticle }: CalendarGridProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<CalendarEntry[]>(`/admin/articles/calendar?year=${year}&month=${month}`)
      .then((e) => {
        setEntries(e);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load calendar'));
    setSelectedDay(null);
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<number, CalendarEntry[]>();
    for (const e of entries) {
      const d = new Date(e.date);
      // Entries are queried per-month in UTC; render on the UTC day so a
      // story doesn't drift across midnight into a neighbouring cell.
      const day = d.getUTCDate();
      map.set(day, [...(map.get(day) ?? []), e]);
    }
    return map;
  }, [entries]);

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  };

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first offset of the 1st (JS getUTCDay: 0=Sun).
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const selectedEntries = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-text-primary">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border/10 bg-bg-2 text-[11px] text-text-secondary hover:bg-bg-3"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={() => shift(1)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border/10 bg-bg-2 text-[11px] text-text-secondary hover:bg-bg-3"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-status-conflict">{error}</p>}

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-[10px] font-medium text-text-tertiary">
            {compact ? d.slice(0, 2) : d}
          </div>
        ))}
        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayEntries = byDay.get(day) ?? [];
          const isToday = isCurrentMonth && today.getDate() === day;
          const selected = selectedDay === day;
          const dots = [...new Set(dayEntries.map((e) => dotStatus(e.status)))].slice(0, 3);
          return (
            <button
              key={day}
              onClick={() => !compact && setSelectedDay(selected ? null : day)}
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[12px] transition-colors ${
                isToday
                  ? 'bg-brand-bg font-semibold text-brand-text'
                  : selected
                    ? 'bg-bg-3 font-semibold text-text-primary'
                    : 'text-text-secondary hover:bg-bg-2'
              } ${compact ? 'cursor-default' : ''}`}
            >
              <span className="leading-none">{day}</span>
              {dots.length > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {dots.map((s) => (
                    <span
                      key={s}
                      className="inline-block h-1 w-1 rounded-full"
                      style={{ backgroundColor: STATUS_ACCENT[s] }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/10 pt-2.5">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
            <StatusDot status={l.status} /> {l.label}
          </span>
        ))}
      </div>

      {!compact && selectedDay && (
        <div className="mt-4">
          <div className="mb-2 text-[12px] font-semibold text-text-primary">
            {new Date(Date.UTC(year, month - 1, selectedDay)).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="flex flex-col gap-1">
            {selectedEntries.map((e) => (
              <button
                key={e.id}
                onClick={() => onOpenArticle?.(e.id)}
                className="flex items-center gap-2 rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-left hover:bg-bg-3"
              >
                <StatusBadge status={e.status} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-primary">{e.title}</span>
                <span className="text-[10px] text-text-tertiary">
                  {new Date(e.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
            {selectedEntries.length === 0 && (
              <p className="py-2 text-[12px] text-text-tertiary">Nothing on this day.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
