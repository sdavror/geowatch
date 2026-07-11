// Heuristic country matcher — checks the HEADLINE only (not the body) for
// an exact, word-boundary country name. Restricting to the title keeps the
// false-positive rate low (a body mentioning five countries in passing
// shouldn't misattribute the story); if the title doesn't clearly name one
// country, the article is left unassigned rather than guessed.
export function matchCountry(
  title: string,
  countries: { id: string; name: string }[],
): string | null {
  // Longest name first so "South Korea" matches before a hypothetical
  // shorter substring collision.
  const sorted = [...countries].sort((a, b) => b.name.length - a.name.length);
  const matches = new Set<string>();
  for (const c of sorted) {
    const pattern = new RegExp(`\\b${escapeRegExp(c.name)}\\b`, 'i');
    if (pattern.test(title)) matches.add(c.id);
  }
  // Exactly one clear match; ambiguous (0 or 2+) stays unassigned.
  return matches.size === 1 ? [...matches][0] : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
