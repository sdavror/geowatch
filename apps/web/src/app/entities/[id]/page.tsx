'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import type { EntityDetail } from '@geowatch/shared-types';
import { fetcher } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { Footer } from '@/components/nav/Footer';
import { ThemeToggle } from '@/components/ThemeToggle';

const ROLE_LABEL: Record<string, string> = {
  director: 'Director',
  beneficial_owner: 'Beneficial owner',
  officer: 'Officer',
};

type Accent = 'conflict' | 'blue' | 'purple' | undefined;

// Badge treatment (solid-ish tinted background, not just colored text) so a
// section title reads as a distinct block at a glance — plain color-on-dark
// text alone wasn't enough contrast to register as "this is the important
// one" against this app's very dark surfaces.
const ACCENT_BADGE: Record<string, string> = {
  conflict: 'bg-status-conflict/20 text-status-conflict',
  blue: 'bg-accent-blue/20 text-accent-blue',
  purple: 'bg-accent-purple/20 text-accent-purple',
};

// Rows get a colored LEFT BORDER stripe (not just a faint tinted
// background) — a stripe reads clearly even at a glance, where a subtle
// background tint alone tends to disappear.
const ACCENT_ROW: Record<string, string> = {
  conflict: 'border-l-4 border-l-status-conflict border-y border-r border-y-border/10 border-r-border/10 bg-status-conflict/[0.08]',
  blue: 'border-l-4 border-l-accent-blue border-y border-r border-y-border/10 border-r-border/10 bg-accent-blue/[0.08]',
  purple: 'border-l-4 border-l-accent-purple border-y border-r border-y-border/10 border-r-border/10 bg-accent-purple/[0.08]',
};

function Section({ title, accent, children }: { title: string; accent?: Accent; children: React.ReactNode }) {
  return (
    <div className="mt-8 border-t border-border/10 pt-6">
      <h2
        className={`mb-3 inline-block rounded-md px-2.5 py-1.5 text-[13px] font-semibold uppercase tracking-wide ${
          accent ? ACCENT_BADGE[accent] : 'text-text-tertiary'
        }`}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ accent, children }: { accent?: Accent; children: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 ${accent ? ACCENT_ROW[accent] : 'border border-border/10 bg-bg-2'}`}>
      {children}
    </div>
  );
}

function SourceTag({ name }: { name: string | undefined | null }) {
  if (!name) return null;
  return <span className="rounded-full bg-bg-3 px-2 py-0.5 text-[11px] text-text-tertiary">{name}</span>;
}

export default function EntityDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  const { data: entity, error, isLoading } = useSWR<EntityDetail>(id ? `/entities/${id}` : null, fetcher);

  const profileFields: Array<[string, string | null | undefined]> = entity
    ? [
        ['Website', entity.website],
        ['Status', entity.status],
        ['Industry', entity.industryLabel ?? entity.industryCode],
        [
          'Address',
          [entity.addressLine, entity.addressCity, entity.addressPostalCode].filter(Boolean).join(', ') || null,
        ],
        ['Country', entity.primaryCountryId],
      ]
    : [];

  const hasRelationships = entity ? entity.relationshipsAsChild.length > 0 || entity.relationshipsAsParent.length > 0 : false;

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border/10 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <Link href="/" className="text-[13px] text-text-secondary transition-colors hover:text-brand-text">
            ← Back to feed
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-[720px] px-4 py-10 sm:px-6">
        {isLoading && (
          <div>
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-4 h-10 w-full" />
            <div className="skeleton mt-2 h-10 w-2/3" />
          </div>
        )}
        {error && <p className="text-sm text-status-conflict">Entity not found.</p>}

        {entity && (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">
              Company profile · Apolitics Entity Resolution
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-bold leading-[1.15] tracking-tight text-text-primary sm:text-[38px]">
                {entity.canonicalName}
              </h1>
              {entity.sanctions.length > 0 && (
                <span className="rounded-full bg-status-conflict/15 px-3 py-1 text-[13px] font-semibold text-status-conflict">
                  ⚠ {entity.sanctions.length} sanction{entity.sanctions.length === 1 ? '' : 's'} on file
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profileFields.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/10 bg-bg-2 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</div>
                  <div className="mt-0.5 truncate text-[14px] text-text-primary">{value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Key facts first — sanctions and ownership structure are what this profile is for. */}
            {entity.sanctions.length > 0 && (
              <Section title={`⚠ Sanctions (${entity.sanctions.length})`} accent="conflict">
                <div className="flex flex-col gap-2">
                  {entity.sanctions.map((s) => (
                    <Row key={s.id} accent="conflict">
                      <span className="text-[14px] font-semibold text-text-primary">{s.regime}</span>
                      <span className="text-[13px] text-text-secondary">{s.program}</span>
                      <SourceTag name={s.source?.name} />
                    </Row>
                  ))}
                </div>
              </Section>
            )}

            {hasRelationships && (
              <Section title="🔗 Corporate relationships" accent="blue">
                <div className="flex flex-col gap-2">
                  {entity.relationshipsAsChild.map((r, idx) =>
                    r.parent ? (
                      <Row key={`p-${idx}`} accent="blue">
                        <span className="text-[11px] uppercase text-text-tertiary">Parent</span>
                        <Link href={`/entities/${r.parent.id}`} className="text-[14px] font-medium text-accent-blue hover:underline">
                          {r.parent.canonicalName}
                        </Link>
                      </Row>
                    ) : null,
                  )}
                  {entity.relationshipsAsParent.map((r, idx) =>
                    r.child ? (
                      <Row key={`c-${idx}`} accent="blue">
                        <span className="text-[11px] uppercase text-text-tertiary">Subsidiary</span>
                        <Link href={`/entities/${r.child.id}`} className="text-[14px] font-medium text-accent-blue hover:underline">
                          {r.child.canonicalName}
                        </Link>
                      </Row>
                    ) : null,
                  )}
                </div>
              </Section>
            )}

            {entity.officers.length > 0 && (
              <Section title={`👤 Officers & beneficial owners (${entity.officers.length})`} accent="purple">
                <div className="flex flex-col gap-2">
                  {entity.officers.map((o) => (
                    <Row key={o.id} accent="purple">
                      <span className="text-[14px] text-text-primary">{o.name}</span>
                      <span className="text-[11px] uppercase text-accent-purple">{ROLE_LABEL[o.role] ?? o.role}</span>
                      {o.countryId && <span className="text-[11px] text-text-tertiary">{o.countryId}</span>}
                      <SourceTag name={o.source?.name} />
                    </Row>
                  ))}
                </div>
              </Section>
            )}

            {entity.aliases.length > 0 && (
              <Section title={`Also known as (${entity.aliases.length})`}>
                <div className="flex flex-wrap gap-2">
                  {entity.aliases.map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1.5 rounded-full border border-border/10 bg-bg-2 px-3 py-1.5 text-[13px] text-text-secondary"
                    >
                      {a.name}
                      <SourceTag name={a.source?.name} />
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Sources">
              <div className="flex flex-wrap gap-2">
                {[...new Set(entity.sourceLinks.map((l) => l.source?.name).filter(Boolean))].map((name) => (
                  <SourceTag key={name} name={name} />
                ))}
              </div>
              <p className="mt-3 text-[12px] text-text-tertiary">
                Cross-referenced from public sanctions lists and company registries by Apolitics&apos; Entity
                Resolution engine. Not legal or compliance advice — verify against primary sources before acting on
                it.
              </p>
            </Section>
          </>
        )}
      </article>

      <Footer />
    </div>
  );
}
