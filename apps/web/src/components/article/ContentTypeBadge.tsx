import { CONTENT_TYPE_COLOR, CONTENT_TYPE_LABEL } from '@geowatch/shared-types';
import type { ArticleContentType } from '@geowatch/shared-types';

/**
 * Editorial framing pill (Analysis/Opinion/Exclusive/Explainer/Fact Check/
 * Live) — filled, distinct from the plain colored-text category tag next
 * to it, so a reader can separate "what kind of piece is this" from "what
 * topic is it about" at a glance. Renders nothing for wire stories, which
 * have no contentType.
 */
export function ContentTypeBadge({ type }: { type: ArticleContentType | null | undefined }) {
  if (!type) return null;
  const color = CONTENT_TYPE_COLOR[type];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
      style={{ backgroundColor: color }}
    >
      {CONTENT_TYPE_LABEL[type]}
    </span>
  );
}
