'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Article, EventCategory } from '@geowatch/shared-types';
import { CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { useAuth, authFetch } from '@/lib/auth';
import { ArticleEditor } from '@/components/admin/ArticleEditor';
import { UserManager } from '@/components/admin/UserManager';
import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm';
import { ProfileForm } from '@/components/admin/ProfileForm';
import { Logo } from '@/components/Logo';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, canEdit, isOwner, logout } = useAuth();

  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState({ pending: 0, published: 0, total: 0 });
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Article | null | 'new'>(null);
  const [tab, setTab] = useState<'news' | 'users' | 'account'>('news');
  // Moderation queue defaults to "Pending" — ingestion drops new stories in
  // unreviewed, so that's what an editor opening this page needs to see first.
  const [newsFilter, setNewsFilter] = useState<'pending' | 'published' | 'all'>('pending');

  const loadArticles = useCallback(async (filter: 'pending' | 'published' | 'all') => {
    try {
      const qs = filter === 'all' ? '' : `?published=${filter === 'published'}`;
      const [list, c] = await Promise.all([
        authFetch<Article[]>(`/admin/articles${qs}`),
        authFetch<{ pending: number; published: number; total: number }>('/admin/articles/counts'),
      ]);
      setArticles(list);
      setCounts(c);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (canEdit) void loadArticles(newsFilter);
  }, [loading, user, canEdit, loadArticles, newsFilter, router]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this story permanently?')) return;
    try {
      await authFetch(`/admin/articles/${id}`, { method: 'DELETE' });
      await loadArticles(newsFilter);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const togglePublish = async (a: Article) => {
    try {
      await authFetch(`/admin/articles/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ published: !a.published }),
      });
      await loadArticles(newsFilter);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-bg">
      <header className="flex h-12 items-center gap-4 border-b border-border/10 bg-bg-2/70 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <Logo href="/admin" />
          <span className="text-[15px] font-semibold tracking-wide text-text-tertiary">Admin</span>
        </div>
        <Link href="/" className="text-[12px] text-text-tertiary hover:text-brand-text">
          ← Site
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-text-tertiary">
            {user.email} · <span className="text-brand-text">{user.role}</span>
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-border/10 bg-bg-3 px-2.5 py-1 text-[12px] text-text-secondary hover:bg-bg-4"
          >
            Sign out
          </button>
        </div>
      </header>

      {!canEdit ? (
        <div className="mx-auto max-w-md px-5 py-12">
          <div className="mb-6 text-center">
            <p className="text-sm text-text-primary">Your account doesn&apos;t have editor access yet.</p>
            <p className="mt-2 text-xs text-text-tertiary">
              Ask an administrator to promote your account to editor. You can still manage your
              account below.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-xs text-brand-text hover:underline"
            >
              ← Back to Apolitics
            </Link>
          </div>
          <ProfileForm />
          <ChangePasswordForm />
        </div>
      ) : (
        <div className="mx-auto max-w-4xl px-5 py-6">
          <div className="mb-5 flex items-center gap-2">
            <button
              onClick={() => setTab('news')}
              className={`rounded-lg px-3 py-1.5 text-xs ${tab === 'news' ? 'bg-bg-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              News
            </button>
            {isOwner && (
              <button
                onClick={() => setTab('users')}
                className={`rounded-lg px-3 py-1.5 text-xs ${tab === 'users' ? 'bg-bg-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
              >
                Users
              </button>
            )}
            <button
              onClick={() => setTab('account')}
              className={`rounded-lg px-3 py-1.5 text-xs ${tab === 'account' ? 'bg-bg-3 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`}
            >
              Account
            </button>
            {tab === 'news' && !editing && (
              <button
                onClick={() => setEditing('new')}
                className="ml-auto rounded-lg bg-brand-bg px-4 py-1.5 text-xs font-medium text-brand-text hover:opacity-90"
              >
                + New story
              </button>
            )}
          </div>

          {tab === 'users' && isOwner && <UserManager />}

          {tab === 'account' && (
            <>
              <ProfileForm />
              <ChangePasswordForm />
            </>
          )}

          {tab === 'news' && editing && (
            <div className="mb-6">
              <ArticleEditor
                article={editing === 'new' ? null : editing}
                onSaved={() => {
                  setEditing(null);
                  void loadArticles(newsFilter);
                }}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {tab === 'news' && !editing && (
            <>
              <div className="mb-4 flex items-center gap-1.5">
                {(['pending', 'published', 'all'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setNewsFilter(f)}
                    className={`rounded-full px-3 py-1 text-[12px] capitalize ${
                      newsFilter === f
                        ? 'bg-brand-bg text-brand-text'
                        : 'bg-bg-3 text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {f} {f === 'pending' ? counts.pending : f === 'published' ? counts.published : counts.total}
                  </button>
                ))}
              </div>
              {listError && <p className="mb-3 text-xs text-status-conflict">{listError}</p>}
              <div className="flex flex-col gap-1">
                {articles.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2"
                  >
                    <span className="text-lg">{a.country?.flagEmoji ?? '🌐'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] text-text-primary">{a.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                        {a.category && (
                          <span style={{ color: CATEGORY_COLOR[a.category as EventCategory] }}>
                            {CATEGORY_LABEL[a.category as EventCategory]}
                          </span>
                        )}
                        <span className="text-text-tertiary">
                          {formatRelativeTime(a.publishedAt ?? a.createdAt ?? null)}
                        </span>
                        <span
                          className={
                            a.published ? 'text-status-stable' : 'text-text-tertiary'
                          }
                        >
                          ● {a.published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePublish(a)}
                      className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-4"
                    >
                      {a.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => setEditing(a)}
                      className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-tertiary hover:text-status-conflict"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {articles.length === 0 && !listError && (
                  <p className="py-8 text-center text-xs text-text-tertiary">
                    {newsFilter === 'pending'
                      ? 'No pending stories — the queue is clear.'
                      : newsFilter === 'published'
                        ? 'Nothing published yet.'
                        : 'No stories yet. Create your first one.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
