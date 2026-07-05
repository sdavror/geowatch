import Link from 'next/link';

/**
 * Apolitics brand mark — the "A-peak": an A without the crossbar, reading
 * as an upward arrow. One solid silhouette so it survives 16px favicons.
 * Fill follows the theme's brand color (lavender — deliberately neither
 * partisan red nor blue).
 */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M24 6 L42 40 L33 40 L24 22 L15 40 L6 40 Z" fill="rgb(var(--color-brand))" />
    </svg>
  );
}

/**
 * Base lockup: mark + wordmark. The slogan intentionally lives OUTSIDE the
 * logo (page hero, meta description) so the lockup stays legible at header
 * size — see the brand lockup system.
 */
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <Mark size={22} />
      <span className="text-[15px] font-semibold tracking-wide text-text-primary">Apolitics</span>
    </Link>
  );
}
