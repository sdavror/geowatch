// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export type CountryStatus = 'conflict' | 'crisis' | 'unstable' | 'stable';

export type EventCategory =
  | 'military'
  | 'economic'
  | 'political'
  | 'humanitarian';

export type UserRole = 'superadmin' | 'editor' | 'viewer';

export type SourceType = 'wire' | 'rss' | 'api' | 'scraper';

export type EntityType = 'country' | 'event' | 'article';

// ─────────────────────────────────────────────
// Country
// ─────────────────────────────────────────────

export interface Country {
  id: string; // ISO 3166-1 alpha-2
  name: string;
  flagEmoji: string | null;
  region: string | null;
  capital: string | null;
  population: number | null;
  // Population change vs the previous year, percent (World Bank data).
  populationYoyPct: number | null;
  gdpUsd: number | null;
  latitude: number | null;
  longitude: number | null;
  status: CountryStatus;
  statusOverride: boolean;
  riskScore: number;
  updatedAt: string;
  createdAt: string;
}

export interface CountryWithDetails extends Country {
  events: GeopoliticalEvent[];
  recentArticles: Article[];
  riskHistory: RiskScoreEntry[];
}

export interface RiskScoreEntry {
  id: string;
  countryId: string;
  score: number;
  breakdown: RiskBreakdown | null;
  computedAt: string;
}

export interface RiskBreakdown {
  military: number;
  economic: number;
  political: number;
  humanitarian: number;
}

// "Country Health" composite index — percentile-normalized World Bank/IMF
// macro indicators + sanctions pressure. Served by GET /macro/scores and
// GET /macro/scores/:countryId. Distinct from RiskScoreEntry above (that
// one drives the map's stability color from a GDP trend); this is a
// separate, macro-indicator-based index.
export interface MacroScoreEntry {
  countryId: string;
  countryName: string;
  region: string | null;
  flagEmoji: string | null;
  value: number;
  period: string;
  components: Record<string, number> | null;
}

// Structured event-impact report from the local-LLM analysis layer
// (POST /admin/analysis/event). Every section is periodized: whatHappened
// is the event itself, impact horizons are explicit (0–3 / 3–12 months)
// so the model can't blur a 2030 forecast into "right now".
export interface EventImpactReport {
  title: string;
  summary: string;
  whatHappened: string;
  affected: Array<{ actor: string; why: string }>;
  impactShortTerm: string[]; // 0–3 months
  impactMediumTerm: string[]; // 3–12 months
  watchpoints: string[]; // indicators/decisions worth monitoring
  // Sections composed into one plain-text document (the article page
  // renders body as pre-wrap text), ready to prefill the editor.
  body: string;
}

// Annual GDP data point, parsed from the World Bank API.
// gdpUsd — current US$; gdpConstUsd — constant 2015 US$ (real GDP).
// Served by GET /countries/:id/gdp-history.
export interface GdpHistoryEntry {
  countryId: string;
  year: number;
  gdpUsd: number;
  gdpConstUsd: number | null;
}

// Annual population data point (World Bank SP.POP.TOTL).
// Served by GET /countries/:id/population-history.
export interface PopulationHistoryEntry {
  countryId: string;
  year: number;
  population: number;
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────

export interface GeopoliticalEvent {
  id: string;
  countryId: string;
  country?: Pick<Country, 'id' | 'name' | 'flagEmoji'>;
  title: string;
  description: string | null;
  category: EventCategory;
  severity: number;
  startedAt: string | null;
  endedAt: string | null;
  sourceUrl: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// News / Articles
// ─────────────────────────────────────────────

export interface Source {
  id: string;
  name: string;
  type: SourceType | null;
  url: string;
  active: boolean;
  fetchIntervalMinutes: number;
  lastFetched: string | null;
  articleCount: number;
  createdAt: string;
}

export interface Article {
  id: string;
  sourceId?: string | null;
  source?: Pick<Source, 'id' | 'name' | 'type'>;
  countryId: string | null;
  country?: Pick<Country, 'id' | 'name' | 'flagEmoji'> & { status?: CountryStatus };
  url: string;
  title: string;
  body?: string | null;
  publishedAt: string | null;
  language?: string;
  category: EventCategory | null;
  tags: string[];
  aiSummary: string | null;
  aiSummaryApproved?: boolean;
  sentimentScore: number | null;
  imageUrl?: string | null;
  published?: boolean;
  fetchedAt?: string;
  createdAt?: string;
  // Only present on GET /articles/most-read responses.
  viewCount?: number;
}

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: UserRole;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// The session user embedded in auth responses.
export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  avatarUrl?: string | null;
}

// Returned by POST /auth/login and /auth/register.
export interface AuthResponse extends AuthTokens {
  user: SessionUser;
}

// Returned by GET /auth/me and admin user listing.
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string | null;
  avatarUrl?: string | null;
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
}

// A comment under an article (GET /articles/:id/comments).
export interface Comment {
  id: string;
  articleId: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ─────────────────────────────────────────────
// API Responses
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface HealthCheck {
  status: 'ok' | 'error';
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  version: string;
  uptime: number;
}

// ─────────────────────────────────────────────
// WebSocket Events
// ─────────────────────────────────────────────

export interface WsNewArticle {
  type: 'new_article';
  article: Article;
}

export interface WsRiskUpdate {
  type: 'risk_update';
  countryId: string;
  riskScore: number;
  status: CountryStatus;
}

export type WsEvent = WsNewArticle | WsRiskUpdate;

// ─────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────

export const STATUS_COLOR: Record<CountryStatus, string> = {
  conflict: '#e84545',
  crisis: '#f28c2a',
  unstable: '#f5c542',
  stable: '#3ecf8e',
};

export const STATUS_LABEL: Record<CountryStatus, string> = {
  conflict: 'Active Conflict',
  crisis: 'Economic Crisis',
  unstable: 'Political Instability',
  stable: 'Stable',
};

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  military: 'Military',
  economic: 'Economic',
  political: 'Political',
  humanitarian: 'Humanitarian',
};

export const CATEGORY_COLOR: Record<EventCategory, string> = {
  military: '#e84545', // same red as 'conflict' status — military news is the most alarming category
  economic: '#f28c2a', // amber, matches 'crisis' status tone
  political: '#4a9eff', // cool blue, distinct from the status palette — political news isn't inherently a danger signal
  humanitarian: '#a78bfa', // violet — deliberately NOT the 'stable' green, since humanitarian news (displacement, aid shortages) is typically distressing, not reassuring
};

export function riskScoreToStatus(score: number): CountryStatus {
  if (score >= 7.5) return 'conflict';
  if (score >= 5.5) return 'crisis';
  if (score >= 3.0) return 'unstable';
  return 'stable';
}
