'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mark } from '@/components/Logo';
import { useAuth } from '@/lib/auth';

export type AdminSection = 'dashboard' | 'news' | 'sources' | 'users' | 'account';

const NAV_ITEMS: Array<{ key: AdminSection; label: string; icon: string; ownerOnly?: boolean }> = [
  { key: 'dashboard', label: 'Dashboard', icon: '◱' },
  { key: 'news', label: 'News', icon: '📰' },
  { key: 'sources', label: 'Sources', icon: '📡' },
  { key: 'users', label: 'Users', icon: '👥', ownerOnly: true },
  { key: 'account', label: 'Account', icon: '⚙' },
];

interface AdminShellProps {
  section: AdminSection;
  onSelectSection: (s: AdminSection) => void;
  children: React.ReactNode;
}

/**
 * Sidebar-nav admin shell — replaces the old flat top-tab layout now that
 * the panel has grown past 3 sections (Dashboard + Sources are new). Fixed
 * width sidebar rather than collapsible: 5 sections doesn't yet justify the
 * complexity of a collapse state.
 */
export function AdminShell({ section, onSelectSection, children }: AdminShellProps) {
  const { user, isOwner, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-border/10 bg-bg-2 px-3 py-4">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
          <Mark size={22} />
          <span className="text-[15px] font-semibold tracking-wide text-text-primary">Admin</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => (
            <button
              key={item.key}
              onClick={() => onSelectSection(item.key)}
              className="relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors"
            >
              {section === item.key && (
                <motion.span
                  layoutId="admin-sidebar-pill"
                  className="absolute inset-0 -z-10 rounded-lg bg-brand-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              <span className="w-4 text-center text-[13px]">{item.icon}</span>
              <span
                className={section === item.key ? 'font-semibold text-brand-text' : 'text-text-secondary'}
              >
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t border-border/10 pt-3">
          <Link href="/" className="mb-2 block px-2.5 text-[12px] text-text-tertiary hover:text-brand-text">
            ← Back to site
          </Link>
          <div className="px-2.5 text-[11px] text-text-tertiary">
            <div className="truncate">{user.email}</div>
            <div className="text-brand-text">{user.role}</div>
          </div>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg border border-border/10 bg-bg-3 px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-bg-4"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
