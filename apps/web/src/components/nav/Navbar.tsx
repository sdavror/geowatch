'use client';

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { CATEGORY_LABEL } from '@geowatch/shared-types';
import type { EventCategory } from '@geowatch/shared-types';

const NAV_CATEGORIES: Array<{ label: string; value: EventCategory | null }> = [
  { label: 'World', value: null },
  { label: 'Conflict', value: 'military' },
  { label: 'Economy', value: 'economic' },
  { label: 'Politics', value: 'political' },
  { label: 'Humanitarian', value: 'humanitarian' },
];

interface NavbarProps {
  activeCategory: EventCategory | null;
  onSelectCategory: (c: EventCategory | null) => void;
  search: string;
  onSearch: (q: string) => void;
}

function Icon({ path, label }: { path: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]" aria-hidden="true" role="img" aria-label={label}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Premium sticky top navigation. Two rows: a utility bar (logo · search ·
 * controls) and a category bar. Backdrop-blurred, hairline-bordered, with
 * the brand blue as the single accent.
 */
export function Navbar({ activeCategory, onSelectCategory, search, onSearch }: NavbarProps) {
  const { user, canEdit } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/10 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Logo />

        <span className="hidden items-center gap-1.5 rounded-full bg-status-conflict/10 px-2.5 py-1 text-[11px] font-medium text-status-conflict lg:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-conflict" />
          LIVE
        </span>

        {/* Search — grows to fill, collapses to an icon on small screens. */}
        <div className="ml-auto flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
          <div className="relative hidden w-full max-w-xs sm:block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              <Icon label="Search" path="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35" />
            </span>
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search stories…"
              className="w-full rounded-full border border-border/10 bg-bg-2 py-2 pl-9 pr-3 text-[13px] text-text-primary transition-colors placeholder:text-text-tertiary focus:border-brand focus:bg-bg focus:outline-none"
            />
          </div>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text"
            aria-label="Bookmarks"
          >
            <Icon label="Bookmarks" path="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z" />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text"
            aria-label="Notifications"
          >
            <Icon label="Notifications" path="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
          </button>

          <div className="h-6 w-px bg-border/10" />

          <ThemeToggle />

          {user ? (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text"
            >
              {mediaUrl(user.avatarUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(user.avatarUrl) as string} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-bg text-[12px] font-semibold text-brand-text">
                  {(user.displayName || user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden sm:inline">{canEdit ? 'Studio' : 'Account'}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Category bar */}
      <nav className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-4 sm:px-6">
        {NAV_CATEGORIES.map((c) => {
          const isActive = activeCategory === c.value;
          return (
            <button
              key={c.label}
              onClick={() => onSelectCategory(c.value)}
              className={`relative whitespace-nowrap px-3 py-2.5 text-[13px] transition-colors ${
                isActive
                  ? 'font-semibold text-text-primary'
                  : 'text-text-secondary hover:text-brand-text'
              }`}
            >
              {c.label}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
        <Link
          href="/map"
          className="ml-auto whitespace-nowrap px-3 py-2.5 text-[13px] text-brand-text hover:underline"
        >
          Live map ›
        </Link>
      </nav>
    </header>
  );
}

export { CATEGORY_LABEL };
