import { createHash } from 'crypto';

/**
 * SHA256 hash of a normalized title+url pair. Same story syndicated to a
 * different URL by a different outlet still normally keeps a near-identical
 * title, so this catches cross-source duplicates that a raw `url` unique
 * constraint alone would miss.
 */
export function contentHash(title: string, url: string): string {
  const normalized = `${title.trim().toLowerCase()}|${url.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex');
}
