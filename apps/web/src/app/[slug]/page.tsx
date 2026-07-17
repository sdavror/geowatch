import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Navbar } from '@/components/nav/Navbar';
import { Footer } from '@/components/nav/Footer';
import { INFO_PAGES, INFO_PAGE_BY_SLUG } from '@/lib/infoPages';

// All Company/Legal footer pages render through this one static route —
// content lives in lib/infoPages.ts, so adding a page is a data change.

export function generateStaticParams() {
  return INFO_PAGES.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = INFO_PAGE_BY_SLUG.get(params.slug);
  return page ? { title: `${page.title} — Apolitics`, description: page.tagline } : {};
}

export default function InfoPage({ params }: { params: { slug: string } }) {
  const page = INFO_PAGE_BY_SLUG.get(params.slug);
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <main className="mx-auto max-w-[720px] px-4 py-12 sm:px-6">
        <h1 className="text-display text-text-primary">{page.title}</h1>
        <p className="mt-2 text-body1 text-text-secondary">{page.tagline}</p>

        <div className="mt-8 flex flex-col gap-8">
          {page.sections.map((section, i) => (
            <section key={i}>
              {section.heading && <h2 className="mb-3 text-h2 text-text-primary">{section.heading}</h2>}
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="mb-3 text-[15px] leading-relaxed text-text-secondary">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="flex list-disc flex-col gap-2 pl-5">
                  {section.bullets.map((b) => (
                    <li key={b.slice(0, 40)} className="text-[15px] leading-relaxed text-text-secondary">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-10 border-t border-border/10 pt-4 text-caption text-text-tertiary">
          Last updated July 2026.
        </p>
      </main>
      <Footer />
    </div>
  );
}
