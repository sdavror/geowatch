'use client';

import { useState } from 'react';
import type { Article, ArticleStatus, EventCategory } from '@geowatch/shared-types';
import { ARTICLE_STATUS_LABEL, CATEGORY_LABEL } from '@geowatch/shared-types';
import { authFetch, uploadImage } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { ResearchPanel } from './ResearchPanel';

const CATEGORIES: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];
const STATUSES: ArticleStatus[] = ['idea', 'draft', 'in_review', 'ready', 'scheduled', 'published', 'archived'];

/** ISO → value usable by <input type="datetime-local"> (local wall time). */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ArticleEditorProps {
  article: Article | null; // null = create new
  /** Pre-fill for a brand-new story (templates). Ignored when editing. */
  initial?: { title?: string; aiSummary?: string; body?: string; category?: EventCategory } | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ArticleEditor({ article, initial, onSaved, onCancel }: ArticleEditorProps) {
  const [title, setTitle] = useState(article?.title ?? initial?.title ?? '');
  const [category, setCategory] = useState<EventCategory>(
    (article?.category as EventCategory) ?? initial?.category ?? 'military',
  );
  const [countryId, setCountryId] = useState(article?.countryId ?? '');
  const [aiSummary, setSummary] = useState(article?.aiSummary ?? initial?.aiSummary ?? '');
  const [body, setBody] = useState(article?.body ?? initial?.body ?? '');
  const [tags, setTags] = useState((article?.tags ?? []).join(', '));
  const [imageUrl, setImageUrl] = useState<string | null>(article?.imageUrl ?? null);
  const [status, setStatus] = useState<ArticleStatus>(
    article?.status ?? (article?.published ? 'published' : 'draft'),
  );
  const [scheduledAt, setScheduledAt] = useState(toLocalInputValue(article?.scheduledAt));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Pre-fill from the ingested story's own text so enriching an existing
  // pending article (the common case — ~1000 thin RSS/Telegram snippets
  // waiting in the queue) takes one click instead of retyping the event.
  // Still freely editable for describing a brand-new event from scratch.
  const [eventText, setEventText] = useState(
    article ? `${article.title}. ${(article.body ?? '').trim()}`.slice(0, 1900) : '',
  );
  const [analyzingEvent, setAnalyzingEvent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyzeEvent = async () => {
    if (eventText.trim().length < 12) {
      setError('Describe the event in a sentence or two (name at least one country)');
      return;
    }
    setAnalyzingEvent(true);
    setError(null);
    try {
      // Local LLM inference (Qwen2.5 on Ollama) — can take up to ~2 minutes.
      const report = await authFetch<{ title: string; summary: string; body: string }>(
        '/admin/analysis/event',
        { method: 'POST', body: JSON.stringify({ text: eventText.trim() }) },
      );
      setTitle(report.title);
      setSummary(report.summary);
      setBody(report.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event analysis failed');
    } finally {
      setAnalyzingEvent(false);
    }
  };

  const handleGenerate = async () => {
    const id = countryId.trim().toUpperCase();
    if (!id) {
      setError('Enter a country (ISO2) first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      // Local LLM inference (Qwen2.5 on Ollama) — can take up to ~2 minutes.
      const draft = await authFetch<{ title: string; summary: string; body: string }>(
        `/admin/analysis/draft/${id}`,
        { method: 'POST' },
      );
      setTitle(draft.title);
      setSummary(draft.summary);
      setBody(draft.body);
      setCountryId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { imageUrl: url } = await uploadImage(file);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (statusOverride?: ArticleStatus) => {
    const finalStatus = statusOverride ?? status;
    if (finalStatus === 'scheduled' && !scheduledAt) {
      setError('Pick a date & time for the scheduled publication');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title,
      category,
      countryId: countryId.trim() ? countryId.trim().toUpperCase() : null,
      aiSummary: aiSummary.trim() || null,
      body: body.trim() || null,
      imageUrl,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
      status: finalStatus,
      scheduledAt:
        finalStatus === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
    try {
      if (article) {
        await authFetch(`/admin/articles/${article.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await authFetch('/admin/articles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const resolvedImage = mediaUrl(imageUrl);

  return (
    <div className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          {article ? 'Edit story' : 'New story'}
        </h2>
        <button
          onClick={onCancel}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>

      <label className="mb-1 block text-[12px] text-text-secondary">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
      />

      <div className="mb-3 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-[12px] text-text-secondary">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as EventCategory)}
            className="w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="mb-1 block text-[12px] text-text-secondary">Country (ISO2)</label>
          <input
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            placeholder="UA"
            maxLength={2}
            className="w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm uppercase text-text-primary focus:border-accent-blue focus:outline-none"
          />
        </div>
        <div className="flex flex-col justify-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || analyzingEvent || busy || uploading}
            title="Generate a draft from the country's macro-intelligence data (local LLM)"
            className="whitespace-nowrap rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-xs text-text-secondary hover:bg-bg-4 disabled:opacity-50"
          >
            {generating ? 'Generating…' : '✨ Generate analysis'}
          </button>
        </div>
      </div>

      <label className="mb-1 block text-[12px] text-text-secondary">
        {article
          ? "Enrich from source data — pre-filled from this story; edit if needed, then run"
          : "Event impact (describe a reported event; the analysis is grounded in the involved countries' data)"}
      </label>
      <div className="mb-3 flex items-start gap-3">
        <textarea
          value={eventText}
          onChange={(e) => setEventText(e.target.value)}
          rows={2}
          placeholder="e.g. Ukraine destroyed a tanker in the Black Sea"
          className="flex-1 resize-y rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAnalyzeEvent}
          disabled={analyzingEvent || generating || busy || uploading}
          title="Structured impact assessment grounded in real data — country health, trade, energy, sanctions, official statements — plus a Sources list (local LLM)"
          className="whitespace-nowrap rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-xs text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {analyzingEvent ? 'Analyzing…' : article ? '🔎 Enrich from source data' : '⚡ Analyze event'}
        </button>
      </div>

      <ResearchPanel text={eventText} />

      <label className="mb-1 block text-[12px] text-text-secondary">Summary</label>
      <textarea
        value={aiSummary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        className="mb-3 w-full resize-y rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
      />

      <label className="mb-1 block text-[12px] text-text-secondary">Body</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        className="mb-3 w-full resize-y rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
      />

      <label className="mb-1 block text-[12px] text-text-secondary">Tags (comma-separated)</label>
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="sanctions, energy, black sea"
        className="mb-3 w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
      />

      <label className="mb-1 block text-[12px] text-text-secondary">Photo</label>
      <div className="mb-3 flex items-center gap-3">
        {resolvedImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedImage}
            alt=""
            className="h-16 w-24 rounded-lg border border-border/10 object-cover"
          />
        )}
        <label className="cursor-pointer rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-xs text-text-secondary hover:bg-bg-4">
          {uploading ? 'Uploading…' : resolvedImage ? 'Replace photo' : 'Upload photo'}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
        {resolvedImage && (
          <button
            onClick={() => setImageUrl(null)}
            className="text-xs text-text-tertiary hover:text-status-conflict"
          >
            Remove
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-text-secondary">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ArticleStatus)}
            className="rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ARTICLE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {status === 'scheduled' && (
          <div>
            <label className="mb-1 block text-[12px] text-text-secondary">Publish at</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSave()}
          disabled={busy || uploading || !title.trim()}
          className="rounded-lg border border-border/10 bg-bg-3 px-4 py-2 text-xs text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          Save ({ARTICLE_STATUS_LABEL[status]})
        </button>
        {status !== 'published' && (
          <button
            onClick={() => handleSave('published')}
            disabled={busy || uploading || !title.trim()}
            className="rounded-lg bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
          >
            Publish now
          </button>
        )}
      </div>
    </div>
  );
}
