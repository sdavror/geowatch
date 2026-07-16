'use client';

import { useState } from 'react';
import type { ResearchBrief } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

interface ResearchPanelProps {
  /** Text to ground the research in — the story's title+body. */
  text: string;
}

/**
 * Raw facts panel for writing articles — the complement to the LLM draft.
 * Everything here is a real number with its period or a clickable link to a
 * primary source; nothing is generated. Instant (no inference), so a
 * journalist can pull it up before deciding whether a story is worth
 * writing at all.
 */
export function ResearchPanel({ text }: ResearchPanelProps) {
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (text.trim().length < 12) {
      setError('The story needs some text naming at least one country');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await authFetch<ResearchBrief>('/admin/analysis/research', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim().slice(0, 1900) }),
      });
      setBrief(result);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  const linkList = (links: Array<{ title: string; url: string; source: string; date: string | null }>, external = true) => (
    <div className="flex flex-col gap-1">
      {links.map((l) => (
        <a
          key={l.url + l.title}
          href={l.url}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="group rounded-md border border-border/10 bg-bg-2 px-2.5 py-1.5 hover:bg-bg-4"
        >
          <div className="text-[12px] text-text-primary group-hover:text-brand-text">{l.title}</div>
          <div className="text-[10px] text-text-tertiary">
            {l.source}
            {l.date ? ` · ${l.date}` : ''}
          </div>
        </a>
      ))}
    </div>
  );

  return (
    <div className="mb-3 rounded-xl border border-border/10 bg-bg-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-secondary">
          Research brief — raw facts &amp; primary-source links, no AI
        </span>
        <button
          type="button"
          onClick={brief ? () => setOpen(!open) : load}
          disabled={loading}
          className="rounded-lg border border-border/10 bg-bg-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-4 disabled:opacity-50"
        >
          {loading ? 'Loading…' : brief ? (open ? 'Hide' : 'Show') : '📚 Load research'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-status-conflict">{error}</p>}

      {brief && open && (
        <div className="mt-3 flex flex-col gap-4">
          {brief.countries.map((c) => (
            <div key={c.countryId}>
              <div className="mb-2 text-[12px] font-semibold text-text-primary">{c.countryName}</div>

              {c.facts.length > 0 && (
                <table className="mb-3 w-full text-[11px]">
                  <tbody>
                    {c.facts.map((f, i) => (
                      <tr key={i} className="border-b border-border/10 last:border-0">
                        <td className="py-1 pr-2 text-text-secondary">{f.label}</td>
                        <td className="py-1 pr-2 text-right font-medium tabular-nums text-text-primary">{f.value}</td>
                        <td className="py-1 pr-2 whitespace-nowrap text-text-tertiary">{f.period}</td>
                        <td className="py-1 whitespace-nowrap text-right text-text-tertiary">{f.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {c.statements.length > 0 && (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    Official statements
                  </div>
                  <div className="mb-3">{linkList(c.statements)}</div>
                </>
              )}

              {c.mediaReports.length > 0 && (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    Local media (unverified)
                  </div>
                  <div className="mb-3">{linkList(c.mediaReports)}</div>
                </>
              )}

              {c.ownCoverage.length > 0 && (
                <>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                    Our coverage
                  </div>
                  <div className="mb-1">{linkList(c.ownCoverage, false)}</div>
                </>
              )}
            </div>
          ))}

          {brief.energy.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                Energy benchmarks
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {brief.energy.map((f, i) => (
                    <tr key={i} className="border-b border-border/10 last:border-0">
                      <td className="py-1 pr-2 text-text-secondary">{f.label}</td>
                      <td className="py-1 pr-2 text-right font-medium tabular-nums text-text-primary">{f.value}</td>
                      <td className="py-1 whitespace-nowrap text-right text-text-tertiary">{f.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
