'use client';

import { useState } from 'react';
import type { Source, SourceType } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

const TYPES: SourceType[] = ['rss', 'scraper', 'wire', 'api'];

interface SourceEditorProps {
  source: Source | null; // null = create new
  onSaved: () => void;
  onCancel: () => void;
}

export function SourceEditor({ source, onSaved, onCancel }: SourceEditorProps) {
  const [name, setName] = useState(source?.name ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [type, setType] = useState<SourceType>(source?.type ?? 'rss');
  const [official, setOfficial] = useState(source?.official ?? false);
  const [countryId, setCountryId] = useState(source?.countryId ?? '');
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState(source?.fetchIntervalMinutes ?? 15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      setError('Name and URL are required');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      url: url.trim(),
      type,
      official,
      countryId: countryId.trim() ? countryId.trim().toUpperCase() : undefined,
      fetchIntervalMinutes,
    };
    try {
      if (source) {
        await authFetch(`/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await authFetch('/admin/sources', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none';

  return (
    <div className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">{source ? 'Edit source' : 'New source'}</h2>
        <button onClick={onCancel} className="text-xs text-text-tertiary hover:text-text-secondary">
          Cancel
        </button>
      </div>

      <label className="mb-1 block text-[12px] text-text-secondary">Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className={`mb-3 ${inputClass}`} placeholder="e.g. President of Ukraine" />

      <label className="mb-1 block text-[12px] text-text-secondary">
        URL {type === 'scraper' && <span className="text-text-tertiary">(t.me/s/&lt;channel&gt; for Telegram)</span>}
      </label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} className={`mb-3 ${inputClass}`} placeholder="https://..." />

      <div className="mb-3 grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-text-secondary">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as SourceType)} className={inputClass}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-text-secondary">Country (ISO2)</label>
          <input
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            maxLength={2}
            placeholder="UA"
            className={`uppercase ${inputClass}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-text-secondary">Fetch every (min)</label>
          <input
            type="number"
            min={5}
            value={fetchIntervalMinutes}
            onChange={(e) => setFetchIntervalMinutes(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-[12px] text-text-secondary">
        <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="h-3.5 w-3.5" />
        Official government/institution source (vs. independent media)
      </label>

      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <button
        onClick={handleSave}
        disabled={busy}
        className="rounded-lg bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : source ? 'Save changes' : 'Add source'}
      </button>
    </div>
  );
}
