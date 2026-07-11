import type { EventCategory } from '@geowatch/shared-types';

// URL slugs for category pages. The nav labels (Conflict/Economy/…) differ
// from the internal EventCategory enum (military/economic/…), so keep the
// mapping in one place.
export const CATEGORY_TO_SLUG: Record<EventCategory, string> = {
  military: 'conflict',
  economic: 'economy',
  political: 'politics',
  humanitarian: 'humanitarian',
};

export const SLUG_TO_CATEGORY: Record<string, EventCategory> = {
  conflict: 'military',
  economy: 'economic',
  politics: 'political',
  humanitarian: 'humanitarian',
};

// Friendly section names for the nav and category headers (the internal
// CATEGORY_LABEL enum reads "Military/Economic/Political" — too clinical for
// a masthead).
export const CATEGORY_NAV_LABEL: Record<EventCategory, string> = {
  military: 'Conflict',
  economic: 'Economy',
  political: 'Politics',
  humanitarian: 'Humanitarian',
};

// One-line standfirst shown under each category page's title.
export const CATEGORY_INTRO: Record<EventCategory, string> = {
  military: 'Wars, security, and armed conflict — tracked without a side.',
  economic: 'Markets, trade, and the forces reshaping the global economy.',
  political: 'Governments, elections, and diplomacy, reported plainly.',
  humanitarian: 'Displacement, aid, and the human cost behind the headlines.',
};

// The order categories appear in the main navigation.
export const NAV_ORDER: EventCategory[] = ['military', 'economic', 'political', 'humanitarian'];
