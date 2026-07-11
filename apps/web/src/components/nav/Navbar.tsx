'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import type { EventCategory } from '@geowatch/shared-types';
import { CATEGORY_TO_SLUG, CATEGORY_NAV_LABEL, NAV_ORDER } from '@/lib/categories';

const NAV_LINKS: Array<{ label: string; href: string; value: EventCategory | null }> = [
  { label: 'World', href: '/', value: null },
  ...NAV_ORDER.map((c) => ({
    label: CATEGORY_NAV_LABEL[c],
    href: `/category/${CATEGORY_TO_SLUG[c]}`,
    value: c,
  })),
];

interface NavbarProps {
  // Highlights the current section; null = the World front page.
  active: EventCategory | null;
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
 * Premium sticky top navigation. Utility bar (logo · search · controls) +
 * a category bar on md+. On mobile the category bar collapses into an
 * off-canvas drawer opened by the burger. Backdrop-blurred, hairline
 * border, brand blue as the single accent.
 */
export function Navbar({ active, search, onSearch }: NavbarProps) {
  const { user, canEdit } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border/10 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Logo />

        <span className="hidden items-center gap-1.5 rounded-full bg-status-conflict/10 px-2.5 py-1 text-[11px] font-medium text-status-conflict lg:inline-flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-conflict" />
          LIVE
        </span>

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
            className="hidden h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text sm:flex"
            aria-label="Bookmarks"
          >
            <Icon label="Bookmarks" path="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z" />
          </button>
          <button
            className="hidden h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text sm:flex"
            aria-label="Notifications"
          >
            <Icon label="Notifications" path="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
          </button>

          <div className="hidden h-6 w-px bg-border/10 sm:block" />

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
              className="hidden rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 sm:block"
            >
              Sign in
            </Link>
          )}

          {/* Burger — mobile only */}
          <button
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-brand-text md:hidden"
            aria-label="Open menu"
          >
            <Icon label="Menu" path="M4 6h16M4 12h16M4 18h16" />
          </button>
        </div>
      </div>

      {/* Category bar — desktop. Rounded pill nav; the active pill is a
          shared-layout Framer Motion element that glides between items. */}
      <nav className="mx-auto hidden max-w-[1400px] items-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 md:flex">
        {NAV_LINKS.map((c) => {
          const isActive = active === c.value;
          return (
            <Link
              key={c.label}
              href={c.href}
              className={`relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                isActive
                  ? 'font-semibold text-brand-text'
                  : 'text-text-secondary hover:text-brand-text'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-brand-bg"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                />
              )}
              {c.label}
            </Link>
          );
        })}
        <Link
          href="/map"
          className="ml-auto whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] text-brand-text transition-colors hover:bg-bg-3"
        >
          Live map ›
        </Link>
      </nav>
    </header>

      {/* Mobile off-canvas drawer — rendered OUTSIDE the backdrop-blurred
          header, whose backdrop-filter would otherwise become the containing
          block for this fixed element and collapse it to the header height. */}
      <AnimatePresence>
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute right-0 top-0 flex h-full w-[82%] max-w-sm flex-col bg-bg shadow-pop"
          >
            <div className="flex h-14 items-center justify-between border-b border-border/10 px-4">
              <Logo />
              <button
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-bg-3 hover:text-brand-text"
                aria-label="Close menu"
              >
                <Icon label="Close" path="M6 6l12 12M18 6L6 18" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="relative mb-4">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                  <Icon label="Search" path="M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35" />
                </span>
                <input
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Search stories…"
                  className="w-full rounded-full border border-border/10 bg-bg-2 py-2.5 pl-9 pr-3 text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
              </div>

              <nav className="flex flex-col">
                {NAV_LINKS.map((c) => (
                  <Link
                    key={c.label}
                    href={c.href}
                    onClick={() => setMenuOpen(false)}
                    className={`border-b border-border/10 py-3 text-[16px] ${
                      active === c.value ? 'font-semibold text-brand-text' : 'text-text-primary'
                    }`}
                  >
                    {c.label}
                  </Link>
                ))}
                <Link
                  href="/map"
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-[16px] text-brand-text"
                >
                  Live map ›
                </Link>
              </nav>
            </div>

            <div className="border-t border-border/10 p-4">
              {user ? (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-full bg-brand px-4 py-2.5 text-center text-[14px] font-medium text-white"
                >
                  {canEdit ? 'Open studio' : 'My account'}
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-full bg-brand px-4 py-2.5 text-center text-[14px] font-medium text-white"
                >
                  Sign in
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </>
  );
}
