'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DashboardStats } from '@geowatch/shared-types';
import { Mark } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth, authFetch } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';

export type AdminSection =
  // Main — mirrors the design's ГОЛОВНЕ block
  | 'dashboard'
  | 'articles' // "All articles" — reached via search / cross-navigation, not the sidebar
  | 'my-articles'
  | 'drafts'
  | 'in-review'
  | 'scheduled'
  | 'published'
  | 'archive'
  // Planning
  | 'tasks'
  | 'calendar'
  | 'kanban'
  // Communication
  | 'comments'
  | 'messages'
  // Analytics
  | 'views'
  | 'audience'
  | 'traffic'
  // Tools
  | 'media'
  | 'tags'
  | 'templates'
  // System (Apolitics-specific, preserved features)
  | 'sources'
  | 'users'
  // Bottom block
  | 'settings'
  | 'help';

interface NavItem {
  key: AdminSection;
  label: string;
  icon: string;
  ownerOnly?: boolean;
  badge?: (stats: DashboardStats) => number;
}

// Sidebar structure is a 1:1 mapping of the design sheet: Main / Planning /
// Communication / Analytics / Tools, then a System group for the
// Apolitics-specific ops features, and Settings/Help pinned at the bottom.
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Main',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: '▦' },
      { key: 'my-articles', label: 'My articles', icon: '📄' },
      { key: 'drafts', label: 'Drafts', icon: '✏️', badge: (s) => s.statusCounts.draft },
      { key: 'in-review', label: 'In review', icon: '🔍', badge: (s) => s.statusCounts.in_review },
      { key: 'scheduled', label: 'Scheduled', icon: '🕓', badge: (s) => s.statusCounts.scheduled },
      { key: 'published', label: 'Published', icon: '📢' },
      { key: 'archive', label: 'Archive', icon: '🗄' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { key: 'tasks', label: 'Tasks', icon: '☑', badge: (s) => s.openTasks },
      { key: 'calendar', label: 'Calendar', icon: '📅' },
      { key: 'kanban', label: 'Kanban', icon: '⿲' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { key: 'comments', label: 'Comments', icon: '💬', badge: (s) => s.comments7d },
      { key: 'messages', label: 'Messages', icon: '✉️', badge: (s) => s.unreadMessages },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { key: 'views', label: 'Views', icon: '📈' },
      { key: 'audience', label: 'Audience', icon: '👥' },
      { key: 'traffic', label: 'Traffic sources', icon: '🧭' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { key: 'media', label: 'Media library', icon: '🖼' },
      { key: 'tags', label: 'Tags', icon: '🏷' },
      { key: 'templates', label: 'Templates', icon: '📋' },
    ],
  },
  {
    title: 'System',
    items: [
      { key: 'sources', label: 'Sources', icon: '📡' },
      { key: 'users', label: 'Users', icon: '🧑‍💼', ownerOnly: true },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'help', label: 'Help & support', icon: '❔' },
];

interface AdminShellProps {
  section: AdminSection;
  onSelectSection: (s: AdminSection) => void;
  onCreate: () => void;
  onSearch: (q: string) => void;
  /**
   * 'bare' hands the whole main column to the child (the editor workspace
   * brings its own top bar); 'default' renders the greeting header.
   */
  chrome?: 'default' | 'bare';
  children: React.ReactNode;
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function NavButton({
  item,
  active,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-body2 transition-colors hover:text-white"
    >
      {active && (
        <motion.span
          layoutId="admin-sidebar-pill"
          className="absolute inset-0 -z-10 rounded-lg bg-brand"
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      )}
      <span className="w-4 text-center text-[13px] leading-none">{item.icon}</span>
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
}

/**
 * Editorial-workspace shell, a 1:1 structural match of the MediaLine design:
 * fixed dark sidebar with the five design groups + System, attention badges,
 * Settings/Help + user card pinned at the bottom; top bar with greeting,
 * story search (⌘K), notifications and the primary Create action.
 */
export function AdminShell({ section, onSelectSection, onCreate, onSearch, chrome = 'default', children }: AdminShellProps) {
  const { user, isOwner, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Refresh badge counts whenever the user moves between sections — actions
  // taken in one section (approving stories, closing tasks, reading
  // messages) should reflect in the sidebar without a manual reload.
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
    ? stats.statusCounts.in_review + stats.openTasks + stats.comments7d + stats.unreadMessages
    : 0;

  const submitSearch = () => {
    onSearch(query.trim());
    if (query.trim()) onSelectSection('articles');
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="flex h-screen w-60 flex-shrink-0 flex-col bg-slate-950 px-3 py-4 text-slate-200">
        <Link href="/admin" className="mb-3 flex items-center gap-2.5 px-2">
          <Mark size={24} />
          <span>
            <span className="block text-[15px] font-semibold leading-tight text-white">Apolitics</span>
            <span className="block text-[10px] leading-tight text-slate-400">editorial workspace</span>
          </span>
        </Link>

        {/* Prominent exit to the public site — pinned at the top where it
            can't be missed, brand-tinted so it reads as an action. */}
        <Link
          href="/"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/15 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand/30"
        >
          ← Back to site
        </Link>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => !i.ownerOnly || isOwner);
            if (items.length === 0) return null;
            return (
              <div key={group.title}>
                <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {group.title}
                </div>
                <div className="flex flex-col gap-px">
                  {items.map((item) => (
                    <NavButton
                      key={item.key}
                      item={item}
                      active={section === item.key}
                      badge={stats && item.badge ? item.badge(stats) : 0}
                      onClick={() => onSelectSection(item.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-3 border-t border-slate-800 pt-2">
          <div className="flex flex-col gap-px">
            {BOTTOM_ITEMS.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={section === item.key}
                badge={0}
                onClick={() => onSelectSection(item.key)}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2.5 rounded-xl bg-slate-900 px-2.5 py-2">
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
              <div className="truncate text-[10px] capitalize text-slate-400">{user.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[12px] font-medium text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200"
          >
            ⏻ Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────── */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        {chrome === 'bare' ? (
          <main className="min-h-0 min-w-0 flex-1">{children}</main>
        ) : (
          <>
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border/10 bg-bg/90 px-6 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="truncate text-h2 text-text-primary">
              {greetingForHour(now.getHours())}, {displayName}! 👋
            </h1>
            <p className="text-caption text-text-tertiary">{dateLine}</p>
          </div>

          <div className="relative ml-auto hidden w-64 sm:block">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
              placeholder="Search stories…"
              className="w-full rounded-full border border-border/10 bg-bg-2 py-1.5 pl-8 pr-12 text-caption text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-text-tertiary">
              🔍
            </span>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border/10 bg-bg-3 px-1 text-[9px] text-text-tertiary">
              ⌘K
            </span>
          </div>

          <ThemeToggle />

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
                      target: 'in-review' as AdminSection,
                    },
                    { count: stats.openTasks, label: 'open tasks', target: 'tasks' as AdminSection },
                    {
                      count: stats.comments7d,
                      label: 'new comments this week',
                      target: 'comments' as AdminSection,
                    },
                    {
                      count: stats.unreadMessages,
                      label: 'unread messages',
                      target: 'messages' as AdminSection,
                    },
                  ].map((n) => (
                    <button
                      key={n.label}
                      onClick={() => {
                        setBellOpen(false);
                        onSelectSection(n.target);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-caption text-text-secondary hover:bg-bg-3"
                    >
                      <span className="font-semibold tabular-nums text-text-primary">{n.count}</span>
                      <span>{n.label}</span>
                    </button>
                  ))}
                  {attention === 0 && (
                    <p className="px-2.5 py-2 text-caption text-text-tertiary">
                      All clear — nothing needs attention.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onCreate}
            className="rounded-full bg-brand-bg px-4 py-1.5 text-caption font-semibold text-brand-text hover:opacity-90"
          >
            + Create
          </motion.button>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
          </>
        )}
      </div>
    </div>
  );
}
