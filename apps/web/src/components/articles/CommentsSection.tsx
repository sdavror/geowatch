'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Comment } from '@geowatch/shared-types';
import { apiFetch, mediaUrl } from '@/lib/api';
import { useAuth, authFetch } from '@/lib/auth';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

export function CommentsSection({ articleId }: { articleId: string }) {
  const { user, isOwner } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setComments(await apiFetch<Comment[]>(`/articles/${articleId}/comments`));
    } catch {
      /* leave empty on error */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await authFetch<Comment>(`/articles/${articleId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim() }),
      });
      setComments((prev) => [created, ...prev]);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await authFetch(`/comments/${id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        Comments {comments.length > 0 && <span className="text-text-tertiary">{comments.length}</span>}
      </h2>

      {user ? (
        <form onSubmit={submit} className="mb-5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Share your thoughts…"
            className="w-full resize-y rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
          />
          {error && <p className="mt-1 text-xs text-status-conflict">{error}</p>}
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="mt-2 rounded-lg bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      ) : (
        <p className="mb-5 text-xs text-text-tertiary">
          <Link href="/login" className="text-brand-text hover:underline">
            Sign in
          </Link>{' '}
          to join the conversation.
        </p>
      )}

      {loading ? (
        <p className="text-xs text-text-tertiary">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-text-tertiary">No comments yet. Be the first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const avatar = mediaUrl(c.author.avatarUrl);
            const canDelete = isOwner || user?.id === c.author.id;
            return (
              <div key={c.id} className="flex gap-3">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 text-xs text-text-secondary">
                    {c.author.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">{c.author.name}</span>
                    <span className="text-[10px] text-text-tertiary">
                      {formatRelativeTime(c.createdAt)}
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => remove(c.id)}
                        className="ml-auto text-[10px] text-text-tertiary hover:text-status-conflict"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-text-secondary">{c.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
