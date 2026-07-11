import Link from 'next/link';
import { Mark } from '@/components/Logo';
import { CATEGORY_TO_SLUG, CATEGORY_NAV_LABEL, NAV_ORDER } from '@/lib/categories';

/**
 * Site-wide editorial footer: brand + slogan, section links, honest data
 * sources, copyright. Deliberately no dead social links — nothing here
 * points at a page that doesn't exist.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/10 bg-bg-2">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <Mark size={22} />
            <span className="text-[15px] font-semibold tracking-wide text-text-primary">Apolitics</span>
          </div>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-text-secondary">
            Apolitically about politics. Conflicts, economies, and political risk across 201
            countries — reported without a side.
          </p>
        </div>

        <nav aria-label="Sections">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Sections
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            <li>
              <Link href="/" className="text-[13px] text-text-secondary transition-colors hover:text-brand-text">
                World
              </Link>
            </li>
            {NAV_ORDER.map((c) => (
              <li key={c}>
                <Link
                  href={`/category/${CATEGORY_TO_SLUG[c]}`}
                  className="text-[13px] text-text-secondary transition-colors hover:text-brand-text"
                >
                  {CATEGORY_NAV_LABEL[c]}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/map" className="text-[13px] text-brand-text transition-colors hover:underline">
                Live risk map ›
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            Data sources
          </h3>
          <p className="mt-3 text-[13px] leading-relaxed text-text-secondary">
            Country risk scores derive from World Bank GDP and population series, refreshed daily.
            Weather by Open-Meteo. Map geometry reflects UN-recognized borders.
          </p>
        </div>
      </div>

      <div className="border-t border-border/10">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <span className="text-[12px] text-text-tertiary">
            © {new Date().getFullYear()} Apolitics. Without bias.
          </span>
          <Link href="/login" className="text-[12px] text-text-tertiary transition-colors hover:text-brand-text">
            Editors sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
