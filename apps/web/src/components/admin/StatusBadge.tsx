import type { ArticleStatus } from '@geowatch/shared-types';
import { ARTICLE_STATUS_LABEL } from '@geowatch/shared-types';

// Fixed badge palette per the MediaLine design sheet — soft tinted pill with
// a saturated label. Deliberately hex (not theme vars): a status must read
// the same in light and dark mode, like the map's semaphore colors.
const STATUS_STYLE: Record<ArticleStatus, { bg: string; fg: string }> = {
  idea: { bg: '#F1F5F9', fg: '#475569' },
  draft: { bg: '#FEF9C3', fg: '#A16207' },
  in_review: { bg: '#EDE9FE', fg: '#7C3AED' },
  ready: { bg: '#CCFBF1', fg: '#0F766E' },
  scheduled: { bg: '#DBEAFE', fg: '#2563EB' },
  published: { bg: '#DCFCE7', fg: '#16A34A' },
  archived: { bg: '#E2E8F0', fg: '#64748B' },
};

export function StatusBadge({ status, className = '' }: { status: ArticleStatus; className?: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {ARTICLE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Dot marker in the same palette — calendar day cells, kanban headers. */
export function StatusDot({ status }: { status: ArticleStatus }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: STATUS_STYLE[status]?.fg ?? '#64748B' }}
    />
  );
}

export const STATUS_ACCENT: Record<ArticleStatus, string> = Object.fromEntries(
  Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.fg]),
) as Record<ArticleStatus, string>;
