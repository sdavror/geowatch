// Common legal-entity-form markers across the jurisdictions Phase 1/2
// actually see (US/UK/RU-transliterated) — stripped so "Gazprom Neft PJSC"
// and "PJSC Gazprom Neft" normalize to the same token set regardless of
// where the legal-form marker sits in the string.
const LEGAL_SUFFIXES = [
  'public joint stock company',
  'open joint stock company',
  'limited liability company',
  'joint stock company',
  'pjsc',
  'jsc',
  'plc',
  'ltd',
  'llc',
  'gmbh',
  'inc',
  'sa',
  'ao',
  'oao',
  'ooo',
  'pao',
  'zao',
  'corp',
  'company',
  'limited',
];

export function normalizeCompanyName(raw: string): string {
  let s = raw.toLowerCase();
  s = s.replace(/["'.,]/g, ' ');
  for (const suffix of LEGAL_SUFFIXES) {
    s = s.replace(new RegExp(`\\b${suffix}\\b`, 'g'), ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Dice's coefficient over character bigrams — dependency-free, and handles
 * minor spelling/transliteration/word-order differences ("Gazprom Neft" vs
 * "GazpromNeft") better than edit-distance for short company names, without
 * pulling in a fuzzy-matching library for one function.
 */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramCounts = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) ?? 0) + 1);
    }
    return map;
  };

  const aBigrams = bigramCounts(a);
  const bBigrams = bigramCounts(b);
  let intersection = 0;
  for (const [bg, count] of aBigrams) {
    intersection += Math.min(count, bBigrams.get(bg) ?? 0);
  }
  const totalA = [...aBigrams.values()].reduce((s, c) => s + c, 0);
  const totalB = [...bBigrams.values()].reduce((s, c) => s + c, 0);
  return (2 * intersection) / (totalA + totalB);
}
