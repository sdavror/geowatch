'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DashboardStats } from '@geowatch/shared-types';
import { Mark } from '@/components/Logo';
import { useAuth, authFetch } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';

export type AdminSection =
  | 'dashboard'
  | 'articles'
  | 'kanban'
  | 'calendar'
  | 'tasks'
  | 'comments'
  | 'sources'
  | 'users'
  | 'account';

interface NavItem {
  key: AdminSection;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  badge?: (stats: DashboardStats) => number;
}

// Grouped like the MediaLine design: workspace / planning / community /
// system. Badges surface "needs attention" counts, not vanity totals.
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Main',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: '▦' },
      { key: 'articles', label: 'Articles', icon: '📰', badge: (s) => s.statusCounts.in_review },
      { key: 'kanban', label: 'Kanban', icon: '⿲' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { key: 'calendar', label: 'Calendar', icon: '📅', badge: (s) => s.statusCounts.scheduled },
      { key: 'tasks', label: 'Tasks', icon: '☑', badge: (s) => s.openTasks },
    ],
  },
  {
    title: 'Community',
    items: [{ key: 'comments', label: 'Comments', icon: '💬', badge: (s) => s.comments7d }],
  },
  {
    title: 'System',
    items: [
      { key: 'sources', label: 'Sources', icon: '📡' },
      { key: 'users', label: 'Users', icon: '👥', ownerOnly: true },
      { key: 'account', label: 'Account', icon: '⚙' },
    ],
  },
];

interface AdminShellProps {
  section: AdminSection;
  onSelectSection: (s: AdminSection) => void;
  onCreate: () => void;
  onSearch: (q: string) => void;
  children: React.ReactNode;
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Editorial-workspace shell per the MediaLine design: fixed dark sidebar with
 * grouped nav + attention badges + user card, and a top bar with greeting,
 * story search, notifications and the primary Create action.
 */
export function AdminShell({ section, onSelectSection, onCreate, onSearch, children }: AdminShellProps) {
  const { user, isOwner, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Refresh badge counts whenever the user moves between sections — actions
  // taken in one section (approving stories, closing tasks) should reflect
  // in the sidebar without a manual reload.
  useEffect(() => {
    authFetch<DashboardStats>('/admin/dashboard/stats')
      .then(setStats)
      .catch(() => undefined);
  }, [section]);

  // ⌘K / Ctrl+K focuses search, matching the shortcut hint in the field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!user) return null;

  const displayName = user.displayName?.trim() || user.email.split('@')[0];
  const avatar = mediaUrl(user.avatarUrl ?? null);
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const attention = stats
    ? stats.statusCounts.in_review + stats.openTasks + stats.comments7d
    : 0;

  const submitSearch = () => {
    onSearch(query.trim());
    if (query.trim()) onSelectSection('articles');
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="flex w-60 flex-shrink-0 flex-col bg-slate-950 px-3 py-4 text-slate-300">
        <Link href="/admin" className="mb-5 flex items-center gap-2.5 px-2">
          <Mark size={24} />
          <span>
            <span className="block text-[15px] font-semibold leading-tight text-white">Apolitics</span>
            <span className="block text-[10px] leading-tight text-slate-500">editorial workspace</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => !i.ownerOnly || isOwner);
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {group.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const active = section === item.key;
                    const badge = stats && item.badge ? item.badge(stats) : 0;
                    return (
                      <button
                        key={item.key}
                        onClick={() => onSelectSection(item.key)}
                        className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:text-white"
                      >
                        {active && (
                          <motion.span
                            layoutId="admin-sidebar-pill"
                            className="absolute inset-0 -z-10 rounded-lg bg-brand"
                            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                          />
                        )}
                        <span className="w-4 text-center text-[13px]">{item.icon}</span>
                        <span className={active ? 'font-semibold text-white' : ''}>{item.label}</span>
                        {badge > 0 && (
                          <span
                            className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                              active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-slate-800 pt-3">
          <Link href="/" className="mb-3 block px-2.5 text-[11px] text-slate-500 hover:text-white">
            ← Back to site
          </Link>
          <div className="flex items-center gap-2.5 rounded-xl bg-slate-900 px-2.5 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-[12px] font-semibold text-white">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-white">{displayName}</div>
              <div className="truncate text-[10px] capitalize text-slate-500">{user.role}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 text-[13px] text-slate-500 hover:text-white"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border/10 bg-bg/90 px-6 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-bold text-text-primary">
              {greetingForHour(now.getHours())}, {displayName}! 👋
            </h1>
            <p className="text-[11px] text-text-tertiary">{dateLine}</p>
          </div>

          <div className="relative ml-auto hidden w-64 sm:block">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder="Search stories…"
              className="w-full rounded-full border border-border/10 bg-bg-2 py-1.5 pl-8 pr-12 text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-text-tertiary">
              🔍
            </span>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border/10 bg-bg-3 px-1 text-[9px] text-text-tertiary">
              ⌘K
            </span>
          </div>

          <div className="relative">
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border/10 bg-bg-2 text-[14px] hover:bg-bg-3"
              title="Notifications"
            >
              🔔
              {attention > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-conflict px-1 text-[9px] font-bold text-white">
                  {attention > 99 ? '99+' : attention}
                </span>
              )}
            </button>
            <AnimatePresence>
              {bellOpen && stats && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-border/10 bg-bg-2 p-2 shadow-lg"
                >
                  {[
                    {
                      count: stats.statusCounts.in_review,
                      label: 'stories awaiting review',
                      target: 'articles' as AdminSection,
                    },
                    { count: stats.openTasks, label: 'open tasks', target: 'tasks' as AdminSection },
                    {
                      count: stats.comments7d,
                      label: 'new comments this week',
                      target: 'comments' as AdminSection,
                    },
                  ].map((n) => (
                    <button
                      key={n.label}
                      onClick={() => {
                        setBellOpen(false);
                        onSelectSection(n.target);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] text-text-secondary hover:bg-bg-3"
                    >
                      <span className="font-semibold tabular-nums text-text-primary">{n.count}</span>
                      <span>{n.label}</span>
                    </button>
                  ))}
                  {attention === 0 && (
                    <p className="px-2.5 py-2 text-[12px] text-text-tertiary">All clear — nothing needs attention.</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onCreate}
            className="rounded-full bg-brand-bg px-4 py-1.5 text-[12px] font-semibold text-brand-text hover:opacity-90"
          >
            + Create
          </motion.button>
        </header>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
