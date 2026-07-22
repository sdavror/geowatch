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

function EntityProfile({ id, onBack }: { id: string; onBack: () => void }) {
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

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-[11px] text-text-tertiary hover:text-text-secondary"
      >
        ← Back to search
      </button>

      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold text-text-primary">{entity.canonicalName}</h2>
        {entity.sanctions.length > 0 && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
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

      <Section title={`Sanctions (${entity.sanctions.length})`}>
        <Rows>
          {entity.sanctions.map((s) => (
            <Row key={s.id}>
              <span className="text-[12px] font-medium text-text-primary">{s.regime}</span>
              <span className="text-[11px] text-text-secondary">{s.program}</span>
              <SourceTag name={s.source?.name} />
            </Row>
          ))}
          {entity.sanctions.length === 0 && <Empty />}
        </Rows>
      </Section>

      <Section title={`Officers (${entity.officers.length})`}>
        <Rows>
          {entity.officers.map((o) => (
            <Row key={o.id}>
              <span className="text-[12px] text-text-primary">{o.name}</span>
              <span className="text-[10px] uppercase text-text-tertiary">{ROLE_LABEL[o.role] ?? o.role}</span>
              {o.countryId && <span className="text-[10px] text-text-tertiary">{o.countryId}</span>}
              <SourceTag name={o.source?.name} />
            </Row>
          ))}
          {entity.officers.length === 0 && <Empty />}
        </Rows>
      </Section>

      {(entity.relationshipsAsParent.length > 0 || entity.relationshipsAsChild.length > 0) && (
        <Section title="Corporate relationships">
          <Rows>
            {entity.relationshipsAsChild.map((r, idx) =>
              r.parent ? (
                <Row key={`p-${idx}`}>
                  <span className="text-[10px] uppercase text-text-tertiary">Parent</span>
                  <span className="text-[12px] text-text-primary">{r.parent.canonicalName}</span>
                </Row>
              ) : null,
            )}
            {entity.relationshipsAsParent.map((r, idx) =>
              r.child ? (
                <Row key={`c-${idx}`}>
                  <span className="text-[10px] uppercase text-text-tertiary">Subsidiary</span>
                  <span className="text-[12px] text-text-primary">{r.child.canonicalName}</span>
                </Row>
              ) : null,
            )}
          </Rows>
        </Section>
      )}

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{title}</h3>
      {children}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/10 bg-bg-2 px-3 py-2">
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-[11px] text-text-tertiary">None on record.</p>;
}

export function EntitiesManager() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const search = async (q: string) => {
    setLoading(true);
    try {
      setResults(await authFetch<EntitySearchResult[]>(`/entities?q=${encodeURIComponent(q)}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  // Initial load shows the most recently updated entities (empty query is
  // valid on the backend — no `q` param filter).
  useEffect(() => {
    void search('');
  }, []);

  if (selectedId) {
    return <EntityProfile id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-text-primary">Entities</h1>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && search(query.trim())}
        placeholder="Search company name or alias…"
        className="mb-4 w-full max-w-md rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
      />

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
            onClick={() => setSelectedId(r.id)}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
            }}
            className="flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2.5 text-left hover:bg-bg-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-text-primary">{r.canonicalName}</div>
              {r.aliases.length > 0 && (
                <div className="mt-0.5 truncate text-[11px] text-text-tertiary">
                  {r.aliases.filter((a) => a !== r.canonicalName).slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
            {r.sanctionCount > 0 && (
              <span className="flex-shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                {r.sanctionCount} sanction{r.sanctionCount === 1 ? '' : 's'}
              </span>
            )}
          </motion.button>
        ))}
        {results.length === 0 && !loading && !error && (
          <p className="py-8 text-center text-xs text-text-tertiary">No entities found.</p>
        )}
      </motion.div>
    </div>
  );
}
