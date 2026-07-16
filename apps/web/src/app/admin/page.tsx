'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Article, ArticleStatus, EventCategory } from '@geowatch/shared-types';
import { ARTICLE_STATUS_LABEL, CATEGORY_LABEL, CATEGORY_COLOR } from '@geowatch/shared-types';
import { useAuth, authFetch } from '@/lib/auth';
import { AdminShell, type AdminSection } from '@/components/admin/AdminShell';
import { DashboardOverview } from '@/components/admin/DashboardOverview';
import { SourcesManager } from '@/components/admin/SourcesManager';
import { ArticleEditor } from '@/components/admin/ArticleEditor';
import { UserManager } from '@/components/admin/UserManager';
import { ChangePasswordForm } from '@/components/admin/ChangePasswordForm';
import { ProfileForm } from '@/components/admin/ProfileForm';
import { KanbanBoard } from '@/components/admin/KanbanBoard';
import { CalendarGrid } from '@/components/admin/CalendarGrid';
import { TaskList } from '@/components/admin/TaskList';
import { CommentsSection } from '@/components/admin/CommentsSection';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { mediaUrl } from '@/lib/api';

type StatusFilter = 'all' | ArticleStatus;

// Tab order mirrors the editorial flow; the review queue leads because
// that's what an editor opening this page needs to see first.
const STATUS_FILTERS: StatusFilter[] = [
  'in_review',
  'all',
  'idea',
  'draft',
  'ready',
  'scheduled',
  'published',
  'archived',
];

// A one-line gauge of "is there anything here" for the moderation queue —
// most ingested stories are RSS excerpts a few sentences long, and an
// editor needs to judge that at a glance across ~1000 pending rows without
// opening each one in the full editor.
function wordCount(text: string | null | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

interface ArticlesSectionProps {
  editing: Article | null | 'new';
  setEditing: (e: Article | null | 'new') => void;
  searchQuery: string;
}

function ArticlesSection({ editing, setEditing, searchQuery }: ArticlesSectionProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('in_review');

  const loadArticles = useCallback(async (f: StatusFilter, q: string) => {
    try {
      const params = new URLSearchParams();
      if (f !== 'all') params.set('status', f);
      if (q) params.set('q', q);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [list, c] = await Promise.all([
        authFetch<Article[]>(`/admin/articles${qs}`),
        authFetch<{ total: number; byStatus: Record<string, number> }>('/admin/articles/counts'),
      ]);
      setArticles(list);
      setCounts(c);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // A search from the header shows matches across every stage — switching
  // to "all" avoids the confusing "searched but the queue tab hid it" case.
  useEffect(() => {
    if (searchQuery) setFilter('all');
  }, [searchQuery]);

  useEffect(() => {
    void loadArticles(filter, searchQuery);
  }, [filter, searchQuery, loadArticles]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this story permanently?')) return;
    try {
      await authFetch(`/admin/articles/${id}`, { method: 'DELETE' });
      await loadArticles(filter, searchQuery);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const setStatus = async (a: Article, status: ArticleStatus) => {
    try {
      await authFetch(`/admin/articles/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadArticles(filter, searchQuery);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const filterLabel = (f: StatusFilter) =>
    f === 'all' ? 'All' : f === 'in_review' ? 'In review' : ARTICLE_STATUS_LABEL[f];
  const filterCount = (f: StatusFilter) =>
    counts ? (f === 'all' ? counts.total : (counts.byStatus?.[f] ?? 0)) : null;

  return (
    <div>
      <div className="mb-5 flex items-center gap-1.5">
        <h1 className="mr-2 text-lg font-bold text-text-primary">Articles</h1>
        {searchQuery && (
          <span className="rounded-full bg-bg-3 px-2.5 py-1 text-[11px] text-text-secondary">
            search: “{searchQuery}”
          </span>
        )}
        {!editing && (
          <button
            onClick={() => setEditing('new')}
            className="ml-auto rounded-full bg-brand-bg px-4 py-1.5 text-xs font-medium text-brand-text hover:opacity-90"
          >
            + New story
          </button>
        )}
      </div>

      {editing && (
        <div className="mb-6">
          <ArticleEditor
            article={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              void loadArticles(filter, searchQuery);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {!editing && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`relative rounded-full px-3 py-1 text-[12px] transition-colors ${
                  filter === f ? 'font-medium text-brand-text' : 'bg-bg-3 text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {filter === f && (
                  <motion.span
                    layoutId="admin-filter-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-brand-bg"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                  />
                )}
                {filterLabel(f)} {filterCount(f) ?? ''}
              </button>
            ))}
          </div>
          {listError && <p className="mb-3 text-xs text-status-conflict">{listError}</p>}
          <motion.div
            key={`${filter}:${searchQuery}`}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.025 } } }}
            className="flex flex-col gap-1"
          >
            {articles.map((a) => {
              const snippet = (a.aiSummary || a.body || '').trim();
              const words = wordCount(a.aiSummary || a.body);
              const thumb = mediaUrl(a.imageUrl);
              return (
                <motion.div
                  key={a.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 450, damping: 34 } },
                  }}
                  className="flex items-start gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2.5"
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-3">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg">{a.country?.flagEmoji ?? '🌐'}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] text-text-primary">{a.title}</span>
                      {a.status && <StatusBadge status={a.status} className="flex-shrink-0" />}
                    </div>
                    {snippet && (
                      <div className="mt-0.5 truncate text-[12px] text-text-tertiary">{snippet}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      {a.category && (
                        <span style={{ color: CATEGORY_COLOR[a.category as EventCategory] }}>
                          {CATEGORY_LABEL[a.category as EventCategory]}
                        </span>
                      )}
                      {a.source && (
                        <span className="flex items-center gap-1 text-text-tertiary">
                          {a.source.name}
                          {a.source.official && (
                            <span className="rounded-full bg-brand-bg px-1.5 py-0 text-[10px] font-medium text-brand-text">
                              Official
                            </span>
                          )}
                        </span>
                      )}
                      <span className="text-text-tertiary">
                        {a.status === 'scheduled' && a.scheduledAt
                          ? `goes live ${new Date(a.scheduledAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : formatRelativeTime(a.publishedAt ?? a.createdAt ?? null)}
                      </span>
                      <span className={words === 0 ? 'text-status-conflict' : words < 30 ? 'text-status-crisis' : 'text-text-tertiary'}>
                        {words === 0 ? 'No body text' : `${words} words`}
                      </span>
                      {!thumb && <span className="text-text-tertiary">No photo</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 self-center">
                    <button
                      onClick={() => setStatus(a, a.status === 'published' ? 'archived' : 'published')}
                      className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-4"
                    >
                      {a.status === 'published' ? 'Archive' : 'Publish'}
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
                </motion.div>
              );
            })}
            {articles.length === 0 && !listError && (
              <p className="py-8 text-center text-xs text-text-tertiary">
                {searchQuery
                  ? 'No stories match your search.'
                  : filter === 'in_review'
                    ? 'No stories awaiting review — the queue is clear.'
                    : filter === 'published'
                      ? 'Nothing published yet.'
                      : 'Nothing here yet.'}
              </p>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading, canEdit, isOwner } = useAuth();
  const [section, setSection] = useState<AdminSection>('dashboard');
  // Editing state lives here (not in ArticlesSection) so the header Create
  // button, dashboard cards, kanban cards and calendar entries can all open
  // the editor from anywhere in the workspace.
  const [editing, setEditing] = useState<Article | null | 'new'>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const openArticle = useCallback((article: Article) => {
    setEditing(article);
    setSection('articles');
  }, []);

  const openArticleById = useCallback(async (id: string) => {
    try {
      const article = await authFetch<Article>(`/articles/${id}`);
      setEditing(article);
      setSection('articles');
    } catch {
      // Ignore — the story may have been deleted since the calendar loaded.
    }
  }, []);

  const startCreate = useCallback(() => {
    setEditing('new');
    setSection('articles');
  }, []);

  const selectSection = useCallback((s: AdminSection) => {
    setSection(s);
    if (s !== 'articles') {
      setEditing(null);
      setSearchQuery('');
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
      </main>
    );
  }

  if (!user) return null;

  if (!canEdit) {
    return (
      <main className="min-h-screen bg-bg">
        <div className="mx-auto max-w-md px-5 py-12">
          <div className="mb-6 text-center">
            <p className="text-sm text-text-primary">Your account doesn&apos;t have editor access yet.</p>
            <p className="mt-2 text-xs text-text-tertiary">
              Ask an administrator to promote your account to editor. You can still manage your account below.
            </p>
          </div>
          <ProfileForm />
          <ChangePasswordForm />
        </div>
      </main>
    );
  }

  return (
    <AdminShell
      section={section}
      onSelectSection={selectSection}
      onCreate={startCreate}
      onSearch={setSearchQuery}
    >
      {section === 'dashboard' && (
        <DashboardOverview
          onOpenArticle={openArticle}
          onCreate={startCreate}
          onGotoArticles={() => selectSection('articles')}
          onGotoTasks={() => selectSection('tasks')}
        />
      )}
      {section === 'articles' && (
        <ArticlesSection editing={editing} setEditing={setEditing} searchQuery={searchQuery} />
      )}
      {section === 'kanban' && <KanbanBoard onOpenArticle={openArticle} />}
      {section === 'calendar' && (
        <div className="max-w-2xl">
          <h1 className="mb-4 text-lg font-bold text-text-primary">Publication calendar</h1>
          <div className="rounded-2xl border border-border/10 bg-bg-2 p-5">
            <CalendarGrid onOpenArticle={openArticleById} />
          </div>
        </div>
      )}
      {section === 'tasks' && (
        <div className="max-w-2xl">
          <h1 className="mb-4 text-lg font-bold text-text-primary">Tasks</h1>
          <TaskList />
        </div>
      )}
      {section === 'comments' && <CommentsSection />}
      {section === 'sources' && <SourcesManager />}
      {section === 'users' && isOwner && <UserManager />}
      {section === 'account' && (
        <div>
          <h1 className="mb-4 text-lg font-bold text-text-primary">Account</h1>
          <ProfileForm />
          <ChangePasswordForm />
        </div>
      )}
    </AdminShell>
  );
}
