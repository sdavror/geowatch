// Same word-boundary matching approach as ingestion/country-matcher.util.ts,
// scaled for thousands of candidate names instead of ~200 countries: a
// cheap case-insensitive substring pre-check (fast native string search)
// filters out the vast majority of candidates before the more expensive
// regex confirms a real word-boundary match, so scanning one article
// against ~10k sanctioned-entity names/aliases stays fast.

export interface EntityMentionCandidate {
  entityId: string;
  name: string;
}

export interface EntityMention {
  entityId: string;
  matchedText: string;
}

// Guards against short/generic names matching ordinary text — same "don't
// guess on thin signal" discipline as the rest of this project's
// text-matching (country matcher only trusts the title, category
// classifier requires a clear winner). Length alone isn't enough: real
// bug found live on the first backfill run — single-word aliases like
// "Alliance", "Prosperity", "DIALOGUE" (all ≥8 chars, all real alias
// entries on real sanctioned entities, evidently shell-company or
// translation-artifact names) matched ordinary policy-speak prose
// constantly ("...Safety, Strength, and Prosperity..."), while multi-word
// matches ("The Houthis", "United Russia", "AI Alliance Russia") were all
// genuinely correct. A single word — however long — just isn't distinctive
// enough on its own; requiring at least two tokens is what actually fixes
// the false-positive rate, not a length threshold.
const MIN_NAME_LENGTH = 8;
const MIN_TOKENS = 2;

export function matchEntityMentions(text: string, candidates: EntityMentionCandidate[]): EntityMention[] {
  const lowerText = text.toLowerCase();
  const seen = new Set<string>();
  const out: EntityMention[] = [];

  for (const c of candidates) {
    if (seen.has(c.entityId)) continue;
    const name = c.name.trim();
    if (name.length < MIN_NAME_LENGTH) continue;
    if (name.split(/\s+/).length < MIN_TOKENS) continue;
    if (!lowerText.includes(name.toLowerCase())) continue;

    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    if (pattern.test(text)) {
      seen.add(c.entityId);
      out.push({ entityId: c.entityId, matchedText: name });
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
