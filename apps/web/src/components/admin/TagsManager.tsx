'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TagStat } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

interface TagsManagerProps {
  /** Opens the All-articles view filtered by this tag. */
  onBrowseTag: (tag: string) => void;
}

/** Site-wide tag vocabulary: usage counts, rename, delete. */
export function TagsManager({ onBrowseTag }: TagsManagerProps) {
  const [tags, setTags] = useState<TagStat[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTags(await authFetch<TagStat[]>('/admin/tags'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rename = async (from: string) => {
    if (!renameTo.trim() || renameTo.trim() === from) {
      setRenaming(null);
      return;
    }
    try {
      await authFetch('/admin/tags/rename', {
        method: 'PATCH',
        body: JSON.stringify({ from, to: renameTo.trim() }),
      });
      setRenaming(null);
      setRenameTo('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const remove = async (tag: string) => {
    if (!window.confirm(`Remove tag “${tag}” from all articles?`)) return;
    try {
      await authFetch(`/admin/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-h1 text-text-primary">Tags</h1>
      <p className="mb-4 text-caption text-text-tertiary">
        Every tag used across stories. Renaming or deleting updates all tagged articles at once.
      </p>
      {error && <p className="mb-3 text-caption text-status-conflict">{error}</p>}

      <div className="flex flex-col gap-1">
        {tags.map((t) => (
          <div
            key={t.tag}
            className="group flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2"
          >
            {renaming === t.tag ? (
              <input
                autoFocus
                value={renameTo}
                onChange={(e) => setRenameTo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void rename(t.tag);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => rename(t.tag)}
                className="flex-1 rounded-md border border-border/10 bg-bg px-2 py-1 text-body2 text-text-primary focus:border-accent-blue focus:outline-none"
              />
            ) : (
              <button
                onClick={() => onBrowseTag(t.tag)}
                className="min-w-0 flex-1 truncate text-left text-body2 text-text-primary hover:text-brand-text"
                title={`Browse stories tagged “${t.tag}”`}
              >
                #{t.tag}
              </button>
            )}
            <span className="rounded-full bg-bg-3 px-2 py-0.5 text-[10px] font-medium tabular-nums text-text-tertiary">
              {t.count}
            </span>
            <span className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => {
                  setRenaming(t.tag);
                  setRenameTo(t.tag);
                }}
                className="text-caption text-text-tertiary hover:text-text-primary"
              >
                Rename
              </button>
              <button onClick={() => remove(t.tag)} className="text-caption text-text-tertiary hover:text-status-conflict">
                Delete
              </button>
            </span>
          </div>
        ))}
        {tags.length === 0 && !error && (
          <p className="py-8 text-center text-caption text-text-tertiary">
            No tags yet — add some in the story editor.
          </p>
        )}
      </div>
    </div>
  );
}
