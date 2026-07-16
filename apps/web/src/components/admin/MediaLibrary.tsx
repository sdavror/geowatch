'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MediaItem } from '@geowatch/shared-types';
import { authFetch, uploadImage } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** All uploaded files with usage info; unused files can be deleted. */
export function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await authFetch<MediaItem[]>('/admin/media'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadImage(file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem) => {
    if (!window.confirm(`Delete ${item.filename} permanently?`)) return;
    try {
      await authFetch(`/admin/media/${encodeURIComponent(item.filename)}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const visible = items.filter((i) =>
    filter === 'all' ? true : filter === 'used' ? i.usedBy !== null : i.usedBy === null,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 text-text-primary">Media library</h1>
        <span className="text-caption text-text-tertiary">
          {items.length} files · {formatSize(items.reduce((s, i) => s + i.sizeBytes, 0))}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {(['all', 'used', 'unused'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-caption capitalize transition-colors ${
                filter === f ? 'bg-brand-bg font-medium text-brand-text' : 'bg-bg-3 text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {f}
            </button>
          ))}
          <label className="cursor-pointer rounded-full bg-brand-bg px-4 py-1.5 text-caption font-medium text-brand-text hover:opacity-90">
            {uploading ? 'Uploading…' : '+ Upload'}
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>
      {error && <p className="mb-3 text-caption text-status-conflict">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((item) => (
          <div key={item.filename} className="group overflow-hidden rounded-xl border border-border/10 bg-bg-2">
            <div className="flex h-28 items-center justify-center overflow-hidden bg-bg-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(item.url) ?? item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="p-2.5">
              <div className="truncate text-caption text-text-primary" title={item.filename}>
                {item.filename}
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-text-tertiary">
                <span>{formatSize(item.sizeBytes)}</span>
                <span>{formatRelativeTime(item.uploadedAt)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                {item.usedBy ? (
                  <span
                    className="min-w-0 truncate rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-medium text-[#16A34A]"
                    title={item.usedBy.label}
                  >
                    {item.usedBy.kind === 'article' ? 'In article' : 'Avatar'}
                  </span>
                ) : (
                  <>
                    <span className="rounded-full bg-bg-3 px-2 py-0.5 text-[10px] text-text-tertiary">Unused</span>
                    <button
                      onClick={() => remove(item)}
                      className="text-[10px] text-text-tertiary opacity-0 transition-opacity hover:text-status-conflict group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && !error && (
          <p className="col-span-full py-10 text-center text-caption text-text-tertiary">
            No files here yet.
          </p>
        )}
      </div>
    </div>
  );
}
