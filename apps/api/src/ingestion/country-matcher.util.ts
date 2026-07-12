// Demonyms/adjectives that name a country without using its DB name — RSS
// headlines favor "Polish PM" / "Israeli settlers" over "Poland's PM" /
// "Israel's settlers". Deliberately omits anything ambiguous across two-plus
// countries (no "Korean" — North vs South; no "Congolese" — Congo vs DR
// Congo) and continent-scale adjectives that produce false positives
// ("American" also reads "Latin American", "North American", etc.).
const DEMONYMS: Record<string, string[]> = {
  RU: ['Russian', 'Russians'],
  UA: ['Ukrainian', 'Ukrainians'],
  CN: ['Chinese'],
  IN: ['Indian', 'Indians'],
  FR: ['French'],
  DE: ['German', 'Germans'],
  IL: ['Israeli', 'Israelis'],
  PS: ['Palestinian', 'Palestinians'],
  IR: ['Iranian', 'Iranians'],
  IQ: ['Iraqi', 'Iraqis'],
  SY: ['Syrian', 'Syrians'],
  TR: ['Turkish'],
  SA: ['Saudi'],
  EG: ['Egyptian', 'Egyptians'],
  JP: ['Japanese'],
  KP: ['North Korean'],
  KR: ['South Korean'],
  PK: ['Pakistani', 'Pakistanis'],
  AF: ['Afghan', 'Afghans'],
  PL: ['Polish'],
  ES: ['Spanish', 'Spaniards'],
  IT: ['Italian', 'Italians'],
  NG: ['Nigerian', 'Nigerians'],
  ZA: ['South African'],
  AU: ['Australian', 'Australians'],
  NZ: ['New Zealander'],
  CA: ['Canadian', 'Canadians'],
  MX: ['Mexican', 'Mexicans'],
  BR: ['Brazilian', 'Brazilians'],
  VE: ['Venezuelan', 'Venezuelans'],
  CU: ['Cuban', 'Cubans'],
  KE: ['Kenyan', 'Kenyans'],
  ET: ['Ethiopian', 'Ethiopians'],
  SD: ['Sudanese'],
  SO: ['Somali', 'Somalis'],
  YE: ['Yemeni', 'Yemenis'],
  LB: ['Lebanese'],
  JO: ['Jordanian', 'Jordanians'],
  QA: ['Qatari', 'Qataris'],
  KW: ['Kuwaiti', 'Kuwaitis'],
  MM: ['Burmese'],
  VN: ['Vietnamese'],
  TH: ['Thai'],
  PH: ['Filipino', 'Filipinos', 'Philippine'],
  ID: ['Indonesian', 'Indonesians'],
  GR: ['Greek', 'Greeks'],
  PT: ['Portuguese'],
  NL: ['Dutch'],
  SE: ['Swedish'],
  NO: ['Norwegian'],
  FI: ['Finnish'],
  CH: ['Swiss'],
  AT: ['Austrian'],
  BE: ['Belgian', 'Belgians'],
  IE: ['Irish'],
  RO: ['Romanian', 'Romanians'],
  HU: ['Hungarian', 'Hungarians'],
  CZ: ['Czech'],
  RS: ['Serbian', 'Serbians', 'Serb'],
  HR: ['Croatian', 'Croatians', 'Croat'],
  BY: ['Belarusian', 'Belarusians'],
  GE: ['Georgian', 'Georgians'],
  AM: ['Armenian', 'Armenians'],
  AZ: ['Azerbaijani'],
  KZ: ['Kazakh', 'Kazakhstani'],
  TW: ['Taiwanese'],
  CD: ['DR Congo', 'DRC'],
};

// Abbreviations distinct enough to match case-SENSITIVELY only — "US" and
// "UK" collide with the common pronoun/word "us"/"uk" if matched
// case-insensitively, so these skip the /i flag that DEMONYMS/country names
// use.
const CASE_SENSITIVE_ALIASES: Record<string, string[]> = {
  US: ['US', 'U.S.', 'USA', 'U.S.A.'],
  GB: ['UK', 'U.K.'],
  AE: ['UAE'],
};

// Heuristic country matcher — checks the HEADLINE only (not the body) for
// an exact, word-boundary country name, demonym/adjective, or abbreviation.
// Restricting to the title keeps the false-positive rate low (a body
// mentioning five countries in passing shouldn't misattribute the story);
// if the title doesn't clearly name one country, the article is left
// unassigned rather than guessed.
export function matchCountry(
  title: string,
  countries: { id: string; name: string }[],
): string | null {
  const validIds = new Set(countries.map((c) => c.id));
  // Longest name first so "South Korea" matches before a hypothetical
  // shorter substring collision.
  const sorted = [...countries].sort((a, b) => b.name.length - a.name.length);
  const matches = new Set<string>();

  for (const c of sorted) {
    const pattern = new RegExp(`\\b${escapeRegExp(c.name)}\\b`, 'i');
    if (pattern.test(title)) matches.add(c.id);
  }
  for (const [id, words] of Object.entries(DEMONYMS)) {
    if (!validIds.has(id)) continue;
    if (words.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i').test(title))) {
      matches.add(id);
    }
  }
  for (const [id, words] of Object.entries(CASE_SENSITIVE_ALIASES)) {
    if (!validIds.has(id)) continue;
    if (words.some((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`).test(title))) {
      matches.add(id);
    }
  }

  // Exactly one clear match; ambiguous (0 or 2+) stays unassigned.
  return matches.size === 1 ? [...matches][0] : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
