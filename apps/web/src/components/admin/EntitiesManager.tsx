'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { EntityDetail, EntitySearchResult } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

const ROLE_LABEL: Record<string, string> = {
  director: 'Director',
  beneficial_owner: 'Beneficial owner',
  officer: 'Officer',
};

function SourceTag({ name }: { name: string | undefined | null }) {
  if (!name) return null;
  return (
    <span className="rounded-full bg-bg-3 px-1.5 py-0.5 text-[10px] text-text-tertiary">{name}</span>
  );
}

function EntityProfile({ id, onBack, onNavigate }: { id: string; onBack: () => void; onNavigate: (id: string) => void }) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch<EntityDetail>(`/entities/${id}`)
      .then((e) => {
        setEntity(e);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load entity'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-xs text-text-tertiary">Loading profile…</p>;
  if (error) return <p className="text-xs text-status-conflict">{error}</p>;
  if (!entity) return null;

  const profileFields: Array<[string, string | null]> = [
    ['Website', entity.website],
    ['Status', entity.status],
    ['Industry', entity.industryLabel ?? entity.industryCode],
    ['Address', [entity.addressLine, entity.addressCity, entity.addressPostalCode].filter(Boolean).join(', ') || null],
    ['Country', entity.primaryCountryId],
  ];

  const hasRelationships = entity.relationshipsAsParent.length > 0 || entity.relationshipsAsChild.length > 0;

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-[11px] text-text-tertiary hover:text-text-secondary">
        ← Back to search
      </button>

      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text-primary">{entity.canonicalName}</h2>
        {entity.sanctions.length > 0 && (
          <span className="rounded-full bg-status-conflict/15 px-2 py-0.5 text-[10px] font-semibold text-status-conflict">
            {entity.sanctions.length} sanction{entity.sanctions.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <p className="mb-4 text-[11px] text-text-tertiary">
        {entity.entityType} · updated {formatRelativeTime(entity.updatedAt)}
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {profileFields.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border/10 bg-bg-2 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</div>
            <div className="mt-0.5 truncate text-[12px] text-text-primary">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Key facts first: sanctions and ownership structure are what this tool exists to surface. */}
      {entity.sanctions.length > 0 && (
        <Section title={`⚠ Sanctions (${entity.sanctions.length})`} accent="conflict">
          <Rows>
            {entity.sanctions.map((s) => (
              <Row key={s.id} accent="conflict">
                <span className="text-[12px] font-semibold text-text-primary">{s.regime}</span>
                <span className="text-[11px] text-text-secondary">{s.program}</span>
                <SourceTag name={s.source?.name} />
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      {hasRelationships && (
        <Section title="🔗 Corporate relationships" accent="blue">
          <Rows>
            {entity.relationshipsAsChild.map((r, idx) =>
              r.parent ? (
                <Row key={`p-${idx}`} accent="blue">
                  <span className="text-[10px] uppercase text-text-tertiary">Parent</span>
                  <button onClick={() => onNavigate(r.parent!.id)} className="text-[12px] font-medium text-accent-blue hover:underline">
                    {r.parent.canonicalName}
                  </button>
                </Row>
              ) : null,
            )}
            {entity.relationshipsAsParent.map((r, idx) =>
              r.child ? (
                <Row key={`c-${idx}`} accent="blue">
                  <span className="text-[10px] uppercase text-text-tertiary">Subsidiary</span>
                  <button onClick={() => onNavigate(r.child!.id)} className="text-[12px] font-medium text-accent-blue hover:underline">
                    {r.child.canonicalName}
                  </button>
                </Row>
              ) : null,
            )}
          </Rows>
        </Section>
      )}

      {entity.officers.length > 0 && (
        <Section title={`👤 Officers & beneficial owners (${entity.officers.length})`} accent="purple">
          <Rows>
            {entity.officers.map((o) => (
              <Row key={o.id} accent="purple">
                <span className="text-[12px] text-text-primary">{o.name}</span>
                <span className="text-[10px] uppercase text-accent-purple">{ROLE_LABEL[o.role] ?? o.role}</span>
                {o.countryId && <span className="text-[10px] text-text-tertiary">{o.countryId}</span>}
                <SourceTag name={o.source?.name} />
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      <Section title={`Aliases (${entity.aliases.length})`}>
        <div className="flex flex-wrap gap-1.5">
          {entity.aliases.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full border border-border/10 bg-bg-2 px-2 py-1 text-[11px] text-text-secondary"
            >
              {a.name}
              <SourceTag name={a.source?.name} />
            </span>
          ))}
          {entity.aliases.length === 0 && <Empty />}
        </div>
      </Section>

      <Section title={`Identifiers (${entity.identifiers.length})`}>
        <Rows>
          {entity.identifiers.map((i) => (
            <Row key={i.id}>
              <span className="font-mono text-[11px] text-text-primary">{i.value}</span>
              <span className="text-[10px] uppercase text-text-tertiary">{i.type}</span>
              {i.countryId && <span className="text-[10px] text-text-tertiary">{i.countryId}</span>}
              <SourceTag name={i.source?.name} />
            </Row>
          ))}
          {entity.identifiers.length === 0 && <Empty />}
        </Rows>
      </Section>

      <Section title={`Source links (${entity.sourceLinks.length})`}>
        <Rows>
          {entity.sourceLinks.map((l, idx) => (
            <Row key={idx}>
              <SourceTag name={l.source?.name} />
              <span className="font-mono text-[10px] text-text-tertiary">{l.externalId}</span>
              <span className="ml-auto text-[10px] text-text-tertiary">{formatRelativeTime(l.fetchedAt)}</span>
            </Row>
          ))}
          {entity.sourceLinks.length === 0 && <Empty />}
        </Rows>
      </Section>
    </div>
  );
}

type Accent = 'conflict' | 'blue' | 'purple' | undefined;

// Badge treatment (solid-ish tinted background, not just colored text) so a
// section title reads as a distinct block at a glance instead of blending
// into the surrounding gray labels — a plain color-on-dark-bg text alone
// wasn't enough contrast to register as "this is the important one."
const ACCENT_BADGE: Record<string, string> = {
  conflict: 'bg-status-conflict/20 text-status-conflict',
  blue: 'bg-accent-blue/20 text-accent-blue',
  purple: 'bg-accent-purple/20 text-accent-purple',
};

// Rows get a colored LEFT BORDER stripe (not just a faint tinted
// background) — a stripe reads clearly even at a glance/small size, where a
// subtle background tint alone tends to disappear against this app's very
// dark surfaces.
const ACCENT_ROW: Record<string, string> = {
  conflict: 'border-l-4 border-l-status-conflict border-y border-r border-y-border/10 border-r-border/10 bg-status-conflict/[0.08]',
  blue: 'border-l-4 border-l-accent-blue border-y border-r border-y-border/10 border-r-border/10 bg-accent-blue/[0.08]',
  purple: 'border-l-4 border-l-accent-purple border-y border-r border-y-border/10 border-r-border/10 bg-accent-purple/[0.08]',
};

function Section({ title, accent, children }: { title: string; accent?: Accent; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3
        className={`mb-2 inline-block rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
          accent ? ACCENT_BADGE[accent] : 'text-text-tertiary'
        }`}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function Row({ accent, children }: { accent?: Accent; children: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${accent ? ACCENT_ROW[accent] : 'border border-border/10 bg-bg-2'}`}>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-[11px] text-text-tertiary">None on record.</p>;
}

export function EntitiesManager() {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const PAGE_SIZE = 50;

  const search = async (q: string, all: boolean, offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (all) params.set('all', 'true');
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const page = await authFetch<EntitySearchResult[]>(`/entities?${params.toString()}`);
      setResults((prev) => (offset === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial load shows the most-sanctioned entities — the ones this tool
  // exists to surface — not just "whatever was last touched."
  useEffect(() => {
    void search('', showAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const openEntity = (id: string) => {
    if (selectedId) setHistory((h) => [...h, selectedId]);
    setSelectedId(id);
  };
  const goBack = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      setSelectedId(prev);
    } else {
      setSelectedId(null);
    }
  };

  if (selectedId) {
    return <EntityProfile id={selectedId} onBack={goBack} onNavigate={openEntity} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-text-primary">Entities</h1>
        <label className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="accent-blue"
          />
          Show all (incl. non-sanctioned reference companies)
        </label>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && search(query.trim(), showAll)}
        placeholder="Search company name or alias…"
        className="mb-4 w-full max-w-md rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
      />

      {!query && !showAll && (
        <p className="mb-3 text-[11px] text-text-tertiary">Showing sanctioned entities, most sanctions first.</p>
      )}
      {loading && <p className="text-xs text-text-tertiary">Loading…</p>}
      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
        className="flex flex-col gap-1.5"
      >
        {results.map((r) => (
          <motion.button
            key={r.id}
            onClick={() => openEntity(r.id)}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
            }}
            className="flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2.5 text-left hover:bg-bg-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] text-text-primary">{r.canonicalName}</span>
                {r.primaryCountryId && <span className="text-[10px] text-text-tertiary">{r.primaryCountryId}</span>}
              </div>
              {r.aliases.length > 0 && (
                <div className="mt-0.5 truncate text-[11px] text-text-tertiary">
                  {r.aliases.filter((a) => a !== r.canonicalName).slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {(r.subsidiaryCount > 0 || r.hasParent) && (
                <span className="rounded-full bg-accent-blue/15 px-2 py-0.5 text-[10px] font-medium text-accent-blue">
                  🔗 {r.hasParent ? 'has parent' : `${r.subsidiaryCount} subsidiar${r.subsidiaryCount === 1 ? 'y' : 'ies'}`}
                </span>
              )}
              {r.sanctionCount > 0 && (
                <span className="rounded-full bg-status-conflict/15 px-2 py-0.5 text-[10px] font-semibold text-status-conflict">
                  {r.sanctionCount} sanction{r.sanctionCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </motion.button>
        ))}
        {results.length === 0 && !loading && !error && (
          <p className="py-8 text-center text-xs text-text-tertiary">No entities found.</p>
        )}
      </motion.div>

      {hasMore && (
        <button
          onClick={() => search(query.trim(), showAll, results.length)}
          disabled={loadingMore}
          className="mt-3 w-full rounded-lg border border-border/10 bg-bg-2 py-2 text-[12px] text-text-secondary hover:bg-bg-3 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
