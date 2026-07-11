import type { EventCategory } from '@prisma/client';

// Keyword-based classifier — no AI budget for this pass (Stage 5 in the MVP
// plan). Whole-word, case-insensitive matches counted per category; highest
// score wins. Ties and zero-score articles stay uncategorized (null) rather
// than guessing — an uncategorized article still shows in "Latest
// updates"/"Most read" (those don't filter by category), it just won't
// appear in a category section, which is the safer failure mode.
const KEYWORDS: Record<EventCategory, string[]> = {
  military: [
    'war', 'conflict', 'strike', 'attack', 'military', 'troops', 'invasion',
    'ceasefire', 'missile', 'drone', 'combat', 'insurgent', 'rebel',
    'offensive', 'airstrike', 'bombing', 'clashes', 'front line', 'soldiers',
  ],
  economic: [
    'gdp', 'inflation', 'market', 'economy', 'trade', 'tariff', 'recession',
    'imf', 'central bank', 'interest rate', 'currency', 'stock', 'debt',
    'unemployment', 'budget', 'deficit', 'exports', 'imports',
  ],
  political: [
    'election', 'president', 'parliament', 'government', 'minister',
    'diplomat', 'sanctions', 'summit', 'treaty', 'coalition', 'referendum',
    'opposition', 'coup', 'resignation', 'vote', 'lawmakers',
  ],
  humanitarian: [
    'refugee', 'displaced', 'aid', 'famine', 'disaster', 'earthquake',
    'flood', 'humanitarian', 'hunger', 'epidemic', 'casualties', 'evacuate',
    'evacuation', 'relief effort', 'shortage',
  ],
};

function countHits(text: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    const pattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(text)) hits++;
  }
  return hits;
}

export function classifyCategory(title: string, body?: string | null): EventCategory | null {
  const text = `${title} ${body ?? ''}`;
  let best: EventCategory | null = null;
  let bestScore = 0;
  for (const [category, keywords] of Object.entries(KEYWORDS) as [EventCategory, string[]][]) {
    const score = countHits(text, keywords);
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}
