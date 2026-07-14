'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Source } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { SourceEditor } from './SourceEditor';

const TYPE_LABEL: Record<string, string> = {
  rss: 'RSS',
  scraper: 'Telegram',
  wire: 'Wire',
  api: 'API',
};

export function SourcesManager() {
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Source | null | 'new'>(null);

  const load = async () => {
    try {
      setSources(await authFetch<Source[]>('/admin/sources'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleActive = async (s: Source) => {
    try {
      await authFetch(`/admin/sources/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: !s.active }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async (s: Source) => {
    if (!window.confirm(`Remove "${s.name}"? Its already-ingested articles stay, but it stops being fetched.`)) return;
    try {
      await authFetch(`/admin/sources/${s.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (editing !== null) {
    return (
      <SourceEditor
        source={editing === 'new' ? null : editing}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-text-primary">Sources</h1>
        <button
          onClick={() => setEditing('new')}
          className="rounded-full bg-brand-bg px-4 py-1.5 text-xs font-medium text-brand-text hover:opacity-90"
        >
          + Add source
        </button>
      </div>

      {loading && <p className="text-xs text-text-tertiary">Loading sources…</p>}
      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
        className="flex flex-col gap-1.5"
      >
        {sources.map((s) => (
          <motion.div
            key={s.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
            }}
            className="flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2.5"
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${s.active ? 'bg-status-stable' : 'bg-text-tertiary'}`}
              title={s.active ? 'Active' : 'Inactive'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] text-text-primary">{s.name}</span>
                {s.official && (
                  <span className="rounded-full bg-brand-bg px-1.5 py-0.5 text-[10px] font-medium text-brand-text">
                    Official
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-tertiary">
                <span>{TYPE_LABEL[s.type ?? ''] ?? s.type ?? '—'}</span>
                {s.countryId && <span>{s.countryId}</span>}
                <span>{s.articleCount} articles</span>
                <span>{s.lastFetched ? `fetched ${formatRelativeTime(s.lastFetched)}` : 'never fetched'}</span>
              </div>
            </div>
            <button
              onClick={() => toggleActive(s)}
              className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-4"
            >
              {s.active ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={() => setEditing(s)}
              className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-4"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(s)}
              className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-tertiary hover:text-status-conflict"
            >
              Delete
            </button>
          </motion.div>
        ))}
        {sources.length === 0 && !loading && !error && (
          <p className="py-8 text-center text-xs text-text-tertiary">No sources yet.</p>
        )}
      </motion.div>
    </div>
  );
}
