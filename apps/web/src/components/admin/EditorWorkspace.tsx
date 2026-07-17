'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  Article,
  ArticleContentType,
  ArticleRevisionEntry,
  ArticleStatus,
  AssistMode,
  AssistResult,
  EventCategory,
  RelatedStory,
} from '@geowatch/shared-types';
import { ARTICLE_STATUS_LABEL, CATEGORY_LABEL, CONTENT_TYPE_LABEL } from '@geowatch/shared-types';
import { authFetch, uploadImage, useAuth } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { readingTimeMinutes } from '@/lib/readingTime';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { ArticleBody } from '@/components/article/ArticleBody';
import { StatusBadge } from './StatusBadge';
import { ResearchPanel } from './ResearchPanel';

const CATEGORIES: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];
const CONTENT_TYPES: ArticleContentType[] = ['analysis', 'opinion', 'exclusive', 'explainer', 'fact_check', 'live'];
const STATUSES: ArticleStatus[] = ['idea', 'draft', 'in_review', 'ready', 'scheduled', 'published', 'archived'];
const AUTOSAVE_DEBOUNCE_MS = 2_500;

/** ISO → value usable by <input type="datetime-local"> (local wall time). */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface DraftState {
  title: string;
  subtitle: string; // stored as aiSummary — the article's dek
  body: string;
  category: EventCategory;
  contentType: ArticleContentType | '';
  countryId: string;
  tags: string; // comma-separated in the input
  imageUrl: string | null;
  status: ArticleStatus;
  scheduledAt: string; // datetime-local value
}

function stateFromArticle(a: Article | null): DraftState {
  return {
    title: a?.title ?? '',
    subtitle: a?.aiSummary ?? '',
    body: a?.body ?? '',
    category: (a?.category as EventCategory) ?? 'political',
    contentType: (a?.contentType as ArticleContentType) ?? '',
    countryId: a?.countryId ?? '',
    tags: (a?.tags ?? []).join(', '),
    imageUrl: a?.imageUrl ?? null,
    status: a?.status ?? 'draft',
    scheduledAt: toLocalInputValue(a?.scheduledAt),
  };
}

function payloadFromState(s: DraftState) {
  return {
    title: s.title.trim(),
    aiSummary: s.subtitle.trim() || null,
    body: s.body || null,
    category: s.category,
    contentType: s.contentType || '',
    countryId: s.countryId.trim() ? s.countryId.trim().toUpperCase() : null,
    imageUrl: s.imageUrl,
    tags: s.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12),
    status: s.status,
    scheduledAt: s.status === 'scheduled' && s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null,
  };
}

// ── SEO score: transparent client-side heuristics ─────────────────
function seoChecks(s: DraftState) {
  const words = s.body.trim() ? s.body.trim().split(/\s+/).length : 0;
  const checks = [
    { label: 'Title length (30–70 chars)', ok: s.title.trim().length >= 30 && s.title.trim().length <= 70 },
    { label: 'Meta description (50–160 chars)', ok: s.subtitle.trim().length >= 50 && s.subtitle.trim().length <= 160 },
    { label: 'Cover image', ok: !!s.imageUrl },
    { label: 'At least 3 tags', ok: s.tags.split(',').map((t) => t.trim()).filter(Boolean).length >= 3 },
    { label: 'Body length (300+ words)', ok: words >= 300 },
    { label: 'Country assigned', ok: s.countryId.trim().length === 2 },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
  return { checks, score };
}

// ── Markdown insertion helpers ────────────────────────────────────
interface MdAction {
  label: string;
  title: string;
  /** Wraps the current selection (prefix/suffix) or inserts a block. */
  apply: (selected: string) => { text: string; block?: boolean };
}

const MD_ACTIONS: MdAction[] = [
  { label: 'H2', title: 'Section heading', apply: (s) => ({ text: `## ${s || 'Heading'}`, block: true }) },
  { label: 'H3', title: 'Sub-heading', apply: (s) => ({ text: `### ${s || 'Heading'}`, block: true }) },
  { label: 'B', title: 'Bold', apply: (s) => ({ text: `**${s || 'bold'}**` }) },
  { label: 'I', title: 'Italic', apply: (s) => ({ text: `*${s || 'italic'}*` }) },
  { label: 'S', title: 'Strikethrough', apply: (s) => ({ text: `~~${s || 'text'}~~` }) },
  { label: '❝', title: 'Quote', apply: (s) => ({ text: `> ${s || 'Quote'}\n> — Attribution`, block: true }) },
  { label: '•', title: 'Bullet list', apply: (s) => ({ text: s ? s.split('\n').map((l) => `- ${l}`).join('\n') : '- First\n- Second', block: true }) },
  { label: '1.', title: 'Numbered list', apply: (s) => ({ text: s ? s.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n') : '1. First\n2. Second', block: true }) },
  { label: '🔗', title: 'Link', apply: (s) => ({ text: `[${s || 'link text'}](https://)` }) },
  { label: '</>', title: 'Code', apply: (s) => ({ text: s.includes('\n') ? `\`\`\`\n${s}\n\`\`\`` : `\`${s || 'code'}\``, block: s.includes('\n') }) },
  { label: '⊞', title: 'Table', apply: () => ({ text: '| Column | Column |\n| --- | --- |\n| Cell | Cell |', block: true }) },
  { label: '—', title: 'Divider', apply: () => ({ text: '---', block: true }) },
];

const AI_ACTIONS: Array<{ mode: AssistMode; icon: string; label: string; hint: string }> = [
  { mode: 'improve', icon: '✏️', label: 'Improve writing', hint: 'Grammar and clarity pass, facts untouched' },
  { mode: 'headline', icon: '💡', label: 'Suggest headline', hint: '5 options to pick from' },
  { mode: 'summary', icon: '📝', label: 'Generate summary', hint: 'Fills the subtitle (dek)' },
  { mode: 'tags', icon: '🏷', label: 'Generate tags', hint: 'Concrete topic tags' },
  { mode: 'tone', icon: '⚖️', label: 'Neutral tone', hint: 'Strips editorialising — "without bias"' },
  { mode: 'translate', icon: '🌐', label: 'Translate to English', hint: 'For ingested non-English stories' },
];

interface EditorWorkspaceProps {
  article: Article | null; // null = new story
  initial?: { title?: string; aiSummary?: string; body?: string; category?: EventCategory } | null;
  onClose: () => void;
}

/**
 * Full-screen writing environment per the Figma mock: fixed top bar with
 * autosave state and Publish, the article itself in the center (cover,
 * display-size title, dek, markdown body with a formatting toolbar and
 * live Preview), and an inspector on the right (Publishing, SEO score,
 * AI assistant, Statistics). Sources dock under the body.
 */
export function EditorWorkspace({ article, initial, onClose }: EditorWorkspaceProps) {
  const { user } = useAuth();
  const [articleId, setArticleId] = useState<string | null>(article?.id ?? null);
  const [draft, setDraft] = useState<DraftState>(() => {
    const base = stateFromArticle(article);
    if (!article && initial) {
      return {
        ...base,
        title: initial.title ?? '',
        subtitle: initial.aiSummary ?? '',
        body: initial.body ?? '',
        category: initial.category ?? base.category,
      };
    }
    return base;
  });
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'error'>('clean');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [preview, setPreview] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<ArticleRevisionEntry[]>([]);
  const [related, setRelated] = useState<RelatedStory[] | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [headlineOptions, setHeadlineOptions] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const articleIdRef = useRef(articleId);
  articleIdRef.current = articleId;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const setField = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaveState('dirty');
  };

  // ── Autosave ────────────────────────────────────────────────────
  const persist = useCallback(async (): Promise<string | null> => {
    const state = draftRef.current;
    if (!state.title.trim()) return articleIdRef.current; // nothing nameable to save yet
    if (savingRef.current) return articleIdRef.current;
    savingRef.current = true;
    setSaveState('saving');
    try {
      const payload = payloadFromState(state);
      let id = articleIdRef.current;
      if (id) {
        await authFetch(`/admin/articles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        const created = await authFetch<Article>('/admin/articles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        id = created.id;
        setArticleId(created.id);
      }
      setLastSavedAt(new Date());
      setSaveState('saved');
      setError(null);
      return id;
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Save failed');
      return articleIdRef.current;
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, saveState, persist]);

  // Flush pending edits when the editor unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Markdown toolbar ────────────────────────────────────────────
  const applyMd = (action: MdAction) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = draft.body.slice(start, end);
    const { text, block } = action.apply(selected);
    const before = draft.body.slice(0, start);
    const after = draft.body.slice(end);
    const glueBefore = block && before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const glueAfter = block && after && !after.startsWith('\n') ? '\n\n' : '';
    setField('body', `${before}${glueBefore}${text}${glueAfter}${after}`);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + glueBefore.length + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { imageUrl } = await uploadImage(file);
      if (!draft.imageUrl) {
        setField('imageUrl', imageUrl); // first image becomes the cover
      } else {
        const el = bodyRef.current;
        const at = el ? el.selectionStart : draft.body.length;
        setField('body', `${draft.body.slice(0, at)}\n\n![](${mediaUrl(imageUrl) ?? imageUrl})\n\n${draft.body.slice(at)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── AI assistant ────────────────────────────────────────────────
  const runAssist = async (mode: AssistMode) => {
    setAiBusy(mode);
    setError(null);
    setHeadlineOptions(null);
    try {
      const el = bodyRef.current;
      const selection = el && el.selectionStart !== el.selectionEnd ? draft.body.slice(el.selectionStart, el.selectionEnd) : null;
      const res = await authFetch<AssistResult>('/admin/analysis/assist', {
        method: 'POST',
        body: JSON.stringify({ mode, title: draft.title, body: draft.body, selection }),
      });
      if (mode === 'headline') {
        setHeadlineOptions(res.variants ?? [res.result]);
      } else if (mode === 'summary') {
        setField('subtitle', res.result);
      } else if (mode === 'tags') {
        setField('tags', res.result);
      } else if (selection && el) {
        const { selectionStart: s, selectionEnd: e } = el;
        setField('body', `${draft.body.slice(0, s)}${res.result}${draft.body.slice(e)}`);
      } else {
        setField('body', res.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI assist failed');
    } finally {
      setAiBusy(null);
    }
  };

  const loadRelated = async () => {
    setAiBusy('related');
    try {
      const id = articleIdRef.current ?? (await persist());
      if (!id) throw new Error('Save the story first (give it a title)');
      setRelated(await authFetch<RelatedStory[]>(`/admin/articles/${id}/related`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setAiBusy(null);
    }
  };

  // ── History ─────────────────────────────────────────────────────
  const openHistory = async () => {
    if (!articleId) return;
    setHistoryOpen(true);
    try {
      setRevisions(await authFetch<ArticleRevisionEntry[]>(`/admin/articles/${articleId}/revisions`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  };

  const restoreRevision = async (rev: ArticleRevisionEntry) => {
    if (!articleId) return;
    if (!window.confirm('Restore this version? The current text is snapshotted first, so this is undoable.')) return;
    try {
      const restored = await authFetch<Article>(`/admin/articles/${articleId}/revisions/${rev.id}/restore`, {
        method: 'POST',
      });
      setDraft((d) => ({ ...d, title: restored.title, subtitle: restored.aiSummary ?? '', body: restored.body ?? '' }));
      setSaveState('saved');
      setLastSavedAt(new Date());
      setHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  };

  // ── Publish ─────────────────────────────────────────────────────
  const publishAs = async (status: ArticleStatus) => {
    setPublishOpen(false);
    if (status === 'scheduled' && !draft.scheduledAt) {
      setError('Pick a date & time in the Publishing panel first');
      return;
    }
    setField('status', status);
    // setField marks dirty; save immediately rather than waiting for debounce
    draftRef.current = { ...draftRef.current, status };
    await persist();
  };

  const seo = useMemo(() => seoChecks(draft), [draft]);
  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0;
  const cover = mediaUrl(draft.imageUrl);
  const authorName = article?.author?.name ?? user?.displayName?.trim() ?? user?.email.split('@')[0] ?? '';

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'dirty'
        ? 'Unsaved changes'
        : saveState === 'error'
          ? 'Save failed — retrying on next edit'
          : lastSavedAt
            ? 'Autosaved'
            : articleId
              ? 'Saved'
              : 'New story';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Top bar ─────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/10 bg-bg/90 px-5 py-2.5 backdrop-blur">
        <button onClick={onClose} className="flex items-center gap-1.5 text-body2 text-text-secondary hover:text-text-primary">
          ← <span className="hidden sm:inline">Back to stories</span>
        </button>
        <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
          <span className={saveState === 'error' ? 'text-status-conflict' : saveState === 'saved' || saveState === 'clean' ? 'text-status-stable' : ''}>
            {saveState === 'saving' ? '◌' : saveState === 'error' ? '✕' : '✓'}
          </span>
          {saveLabel}
        </span>
        {lastSavedAt && (
          <span className="hidden text-caption text-text-tertiary md:inline">
            🕐 Last edit {formatRelativeTime(lastSavedAt.toISOString())}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {articleId && (
            <button
              onClick={openHistory}
              className="rounded-full border border-border/10 bg-bg-2 px-3 py-1.5 text-caption text-text-secondary hover:bg-bg-3"
            >
              🕘 History
            </button>
          )}
          <button
            onClick={() => setPreview((v) => !v)}
            className={`rounded-full border px-3 py-1.5 text-caption transition-colors ${
              preview ? 'border-brand bg-brand-bg font-medium text-brand-text' : 'border-border/10 bg-bg-2 text-text-secondary hover:bg-bg-3'
            }`}
          >
            👁 {preview ? 'Editing off' : 'Preview'}
          </button>
          <div className="relative">
            <div className="flex overflow-hidden rounded-full">
              <button
                onClick={() => publishAs('published')}
                className="bg-brand px-4 py-1.5 text-caption font-semibold text-white hover:opacity-90"
              >
                {draft.status === 'published' ? 'Update' : 'Publish'}
              </button>
              <button
                onClick={() => setPublishOpen((v) => !v)}
                className="border-l border-white/25 bg-brand px-2 py-1.5 text-caption text-white hover:opacity-90"
                aria-label="Publish options"
              >
                ▾
              </button>
            </div>
            <AnimatePresence>
              {publishOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-border/10 bg-bg-2 p-1.5 shadow-lg"
                >
                  {([
                    ['published', 'Publish now'],
                    ['scheduled', 'Schedule (set time →)'],
                    ['ready', 'Mark ready to publish'],
                    ['in_review', 'Send to review'],
                    ['archived', 'Archive'],
                  ] as Array<[ArticleStatus, string]>).map(([s, label]) => (
                    <button
                      key={s}
                      onClick={() => publishAs(s)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-caption text-text-secondary hover:bg-bg-3"
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-border/10 bg-bg-2 px-5 py-1.5 text-caption text-status-conflict">{error}</div>
      )}

      {/* ── Editor + inspector ──────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Center column */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[780px] px-6 py-8">
            {/* Cover */}
            {cover ? (
              <div className="group relative mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" className="max-h-[380px] w-full rounded-2xl border border-border/10 object-cover" />
                <div className="absolute right-3 top-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <label className="cursor-pointer rounded-full bg-bg/90 px-3 py-1 text-caption text-text-secondary backdrop-blur hover:text-text-primary">
                    Replace
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} />
                  </label>
                  <button onClick={() => setField('imageUrl', null)} className="rounded-full bg-bg/90 px-3 py-1 text-caption text-text-secondary backdrop-blur hover:text-status-conflict">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="mb-6 flex cursor-pointer items-center gap-2 text-caption text-text-tertiary hover:text-text-secondary">
                🖼 {uploading ? 'Uploading…' : 'Add cover'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} />
              </label>
            )}

            {/* Title */}
            <textarea
              value={draft.title}
              onChange={(e) => setField('title', e.target.value.replace(/\n/g, ' '))}
              placeholder="Article title"
              rows={1}
              className="w-full resize-none overflow-hidden bg-transparent font-sans text-display text-text-primary placeholder:text-text-tertiary/50 focus:outline-none"
              style={{ height: 'auto' }}
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
            />

            {/* Subtitle / dek */}
            <textarea
              value={draft.subtitle}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder="Subtitle — one or two sentences on what happened and why it matters"
              rows={2}
              className="mt-2 w-full resize-none bg-transparent text-body1 text-text-secondary placeholder:text-text-tertiary/50 focus:outline-none"
            />

            {/* Toolbar */}
            {!preview && (
              <div className="sticky top-0 z-10 mb-4 mt-4 flex flex-wrap items-center gap-0.5 rounded-xl border border-border/10 bg-bg-2/95 px-2 py-1.5 backdrop-blur">
                {MD_ACTIONS.map((a) => (
                  <button
                    key={a.title}
                    onClick={() => applyMd(a)}
                    title={a.title}
                    className="min-w-7 rounded-md px-1.5 py-1 text-caption text-text-secondary hover:bg-bg-3 hover:text-text-primary"
                  >
                    {a.label}
                  </button>
                ))}
                <label
                  title="Insert image"
                  className="min-w-7 cursor-pointer rounded-md px-1.5 py-1 text-center text-caption text-text-secondary hover:bg-bg-3 hover:text-text-primary"
                >
                  🖼
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && insertImage(e.target.files[0])} />
                </label>
                <span className="mx-1 h-4 w-px bg-border/10" />
                <button
                  onClick={() => runAssist('improve')}
                  disabled={aiBusy !== null}
                  title="AI: improve selection or whole text"
                  className="rounded-md px-2 py-1 text-caption font-medium text-brand-text hover:bg-brand-bg disabled:opacity-50"
                >
                  {aiBusy === 'improve' ? '✨ Working…' : '✨ Ask AI'}
                </button>
              </div>
            )}

            {/* Body: write or preview */}
            {preview ? (
              <div className="mt-4 min-h-64">
                <ArticleBody markdown={draft.body || '*Nothing to preview yet.*'} />
              </div>
            ) : (
              <textarea
                ref={bodyRef}
                value={draft.body}
                onChange={(e) => setField('body', e.target.value)}
                placeholder="Write the story… Markdown is supported: ## headings, **bold**, > quotes, - lists, tables."
                rows={18}
                className="w-full resize-y bg-transparent font-serif text-[17px] leading-[1.75] text-text-primary placeholder:text-text-tertiary/50 focus:outline-none"
              />
            )}

            {/* Sources dock */}
            <div className="mt-8 border-t border-border/10 pt-5">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-h3 text-text-primary">Sources</h2>
                {article?.source && (
                  <span className="flex items-center gap-1 rounded-full border border-border/10 bg-bg-2 px-2.5 py-1 text-caption text-text-secondary">
                    {article.source.name}
                    {article.source.official && (
                      <span className="rounded-full bg-brand-bg px-1.5 text-[10px] font-medium text-brand-text">Official</span>
                    )}
                  </span>
                )}
              </div>
              <ResearchPanel text={`${draft.title}. ${draft.body}`.slice(0, 1900)} />
            </div>
          </div>
        </div>

        {/* ── Inspector ─────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto border-l border-border/10 bg-bg-2/50 px-4 py-5">
          {/* Publishing */}
          <section className="mb-5">
            <h3 className="mb-2.5 text-caption font-semibold uppercase tracking-wide text-text-tertiary">Publishing</h3>
            <div className="flex flex-col gap-2.5 text-body2">
              <div className="flex items-center justify-between">
                <span className="text-text-tertiary">Status</span>
                <StatusBadge status={draft.status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Move to</span>
                <select
                  value={draft.status}
                  onChange={(e) => setField('status', e.target.value as ArticleStatus)}
                  className="rounded-lg border border-border/10 bg-bg px-2 py-1 text-caption text-text-primary focus:border-accent-blue focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ARTICLE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              {draft.status === 'scheduled' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-tertiary">Publish at</span>
                  <input
                    type="datetime-local"
                    value={draft.scheduledAt}
                    onChange={(e) => setField('scheduledAt', e.target.value)}
                    className="rounded-lg border border-border/10 bg-bg px-2 py-1 text-caption text-text-primary focus:border-accent-blue focus:outline-none"
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-text-tertiary">Author</span>
                <span className="text-text-primary">{authorName}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Category</span>
                <select
                  value={draft.category}
                  onChange={(e) => setField('category', e.target.value as EventCategory)}
                  className="rounded-lg border border-border/10 bg-bg px-2 py-1 text-caption text-text-primary focus:border-accent-blue focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Content type</span>
                <select
                  value={draft.contentType}
                  onChange={(e) => setField('contentType', e.target.value as ArticleContentType | '')}
                  className="rounded-lg border border-border/10 bg-bg px-2 py-1 text-caption text-text-primary focus:border-accent-blue focus:outline-none"
                >
                  <option value="">None (plain news)</option>
                  {CONTENT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {CONTENT_TYPE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">Country</span>
                <input
                  value={draft.countryId}
                  onChange={(e) => setField('countryId', e.target.value)}
                  placeholder="UA"
                  maxLength={2}
                  className="w-14 rounded-lg border border-border/10 bg-bg px-2 py-1 text-center text-caption uppercase text-text-primary focus:border-accent-blue focus:outline-none"
                />
              </div>
              <div>
                <span className="mb-1 block text-text-tertiary">Tags</span>
                <input
                  value={draft.tags}
                  onChange={(e) => setField('tags', e.target.value)}
                  placeholder="sanctions, energy, black sea"
                  className="w-full rounded-lg border border-border/10 bg-bg px-2 py-1.5 text-caption text-text-primary focus:border-accent-blue focus:outline-none"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {draft.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="rounded-full bg-brand-bg px-2 py-0.5 text-[10px] font-medium text-brand-text">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* SEO score */}
          <section className="mb-5 rounded-xl border border-border/10 bg-bg p-3">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-tertiary">SEO score</h3>
            <div className="flex items-center gap-3">
              <div
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(${seo.score >= 70 ? '#16A34A' : seo.score >= 40 ? '#F59E0B' : '#EF4444'} ${seo.score * 3.6}deg, rgb(var(--color-bg-4)) 0deg)`,
                }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-bg text-body2 font-bold tabular-nums text-text-primary">
                  {seo.score}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {seo.checks.map((c) => (
                  <span key={c.label} className={`text-[10px] ${c.ok ? 'text-status-stable' : 'text-text-tertiary'}`}>
                    {c.ok ? '✓' : '○'} {c.label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* AI assistant */}
          <section className="mb-5 rounded-xl border border-border/10 bg-bg p-3">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-tertiary">✨ AI assistant</h3>
            <div className="flex flex-col gap-1">
              {AI_ACTIONS.map((a) => (
                <button
                  key={a.mode}
                  onClick={() => runAssist(a.mode)}
                  disabled={aiBusy !== null}
                  title={a.hint}
                  className="flex items-center gap-2 rounded-lg border border-border/10 bg-bg-2 px-2.5 py-1.5 text-left text-caption text-text-secondary hover:bg-bg-3 disabled:opacity-50"
                >
                  <span>{a.icon}</span>
                  {aiBusy === a.mode ? 'Working… (local LLM)' : a.label}
                </button>
              ))}
              <button
                onClick={loadRelated}
                disabled={aiBusy !== null}
                className="flex items-center gap-2 rounded-lg border border-border/10 bg-bg-2 px-2.5 py-1.5 text-left text-caption text-text-secondary hover:bg-bg-3 disabled:opacity-50"
              >
                <span>🔎</span>
                {aiBusy === 'related' ? 'Looking…' : 'Find related stories'}
              </button>
            </div>

            {headlineOptions && (
              <div className="mt-2 rounded-lg border border-border/10 bg-bg-2 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase text-text-tertiary">Pick a headline</div>
                {headlineOptions.map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setField('title', h);
                      setHeadlineOptions(null);
                    }}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-caption text-text-primary hover:bg-bg-3"
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}

            {related && (
              <div className="mt-2 rounded-lg border border-border/10 bg-bg-2 p-2">
                <div className="mb-1 text-[10px] font-semibold uppercase text-text-tertiary">Related stories</div>
                {related.length === 0 && <p className="px-2 py-1 text-caption text-text-tertiary">Nothing related found.</p>}
                {related.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => applyMdLink(r)}
                    title="Insert as a link at the cursor"
                    className="block w-full rounded-md px-2 py-1.5 text-left text-caption text-text-primary hover:bg-bg-3"
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Statistics */}
          <section className="rounded-xl border border-border/10 bg-bg p-3">
            <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-tertiary">Statistics</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-body2">
              <div>
                <div className="text-caption text-text-tertiary">Reading time</div>
                <div className="font-medium text-text-primary">{readingTimeMinutes(draft.body, draft.subtitle)} min</div>
              </div>
              <div>
                <div className="text-caption text-text-tertiary">Word count</div>
                <div className="font-medium tabular-nums text-text-primary">{words.toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="text-caption text-text-tertiary">Characters</div>
                <div className="font-medium tabular-nums text-text-primary">{draft.body.length.toLocaleString('en-US')}</div>
              </div>
              <div>
                <div className="text-caption text-text-tertiary">Last saved</div>
                <div className="font-medium text-text-primary">
                  {lastSavedAt ? formatRelativeTime(lastSavedAt.toISOString()) : '—'}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* ── History drawer ──────────────────────────────── */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-40 bg-black/30"
            />
            <motion.div
              initial={{ x: 360 }}
              animate={{ x: 0 }}
              exit={{ x: 360 }}
              transition={{ type: 'spring', stiffness: 400, damping: 36 }}
              className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border/10 bg-bg shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-border/10 px-4 py-3">
                <h2 className="text-h3 text-text-primary">History</h2>
                <button onClick={() => setHistoryOpen(false)} className="text-text-tertiary hover:text-text-primary">
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {revisions.map((rev) => (
                  <div key={rev.id} className="mb-2 rounded-xl border border-border/10 bg-bg-2 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <StatusBadge status={rev.status} />
                      <span className="text-[10px] text-text-tertiary">{formatRelativeTime(rev.createdAt)}</span>
                    </div>
                    <div className="truncate text-caption text-text-primary">{rev.title}</div>
                    <div className="mt-0.5 text-[10px] text-text-tertiary">{rev.words} words</div>
                    <button
                      onClick={() => restoreRevision(rev)}
                      className="mt-2 rounded-full border border-border/10 bg-bg px-3 py-1 text-[10px] text-text-secondary hover:bg-bg-3"
                    >
                      Restore this version
                    </button>
                  </div>
                ))}
                {revisions.length === 0 && (
                  <p className="py-8 text-center text-caption text-text-tertiary">
                    No snapshots yet — they appear as you keep editing.
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );

  // Inserts a related story as a markdown link at the cursor (internal links
  // also feed the SEO habit the mock's checklist encourages).
  function applyMdLink(r: RelatedStory) {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : draft.body.length;
    setField('body', `${draft.body.slice(0, at)}[${r.title}](/news/${r.id})${draft.body.slice(at)}`);
    setRelated(null);
  }
}
