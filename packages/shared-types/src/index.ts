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

// Editorial workflow stage (admin board). `published` boolean remains the
// public-visibility flag; the API keeps the two in sync.
export type ArticleStatus =
  | 'idea'
  | 'draft'
  | 'in_review'
  | 'ready'
  | 'scheduled'
  | 'published'
  | 'archived';

export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = {
  idea: 'Idea',
  draft: 'Draft',
  in_review: 'In review',
  ready: 'Ready to publish',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};

export type TaskPriority = 'urgent' | 'high' | 'normal';

// Editorial framing badge, distinct from `category` (topic) and `kind`
// (editorial vs wire, derived from authorId/sourceId, not stored). A wire
// story stays null — only newsroom-tagged pieces get a badge.
export type ArticleContentType =
  | 'analysis'
  | 'opinion'
  | 'exclusive'
  | 'explainer'
  | 'fact_check'
  | 'live';

export const CONTENT_TYPE_LABEL: Record<ArticleContentType, string> = {
  analysis: 'Analysis',
  opinion: 'Opinion',
  exclusive: 'Exclusive',
  explainer: 'Explainer',
  fact_check: 'Fact Check',
  live: 'Live',
};

export const CONTENT_TYPE_COLOR: Record<ArticleContentType, string> = {
  analysis: '#2563EB',
  opinion: '#8b5cf6',
  exclusive: '#e84545',
  explainer: '#0ea5a4',
  fact_check: '#f28c2a',
  live: '#e84545',
};

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

// Research brief — RAW verifiable facts for a journalist to write from,
// deliberately NOT LLM prose: real indicator values with years, primary
// sources with clickable URLs, own related coverage. Served by
// POST /admin/analysis/research.
export interface ResearchFact {
  label: string;
  value: string;
  period: string; // "actual 2024" | "forecast 2030" | ISO date
  source: string; // e.g. "World Bank", "IMF WEO"
}

export interface ResearchLink {
  title: string;
  url: string;
  source: string;
  date: string | null; // YYYY-MM-DD
  official: boolean;
}

export interface CountryResearch {
  countryId: string;
  countryName: string;
  facts: ResearchFact[];
  statements: ResearchLink[]; // official, with URLs to the originals
  mediaReports: ResearchLink[]; // grey tier, clearly separated
  ownCoverage: ResearchLink[]; // our own published articles
}

export interface ResearchBrief {
  countries: CountryResearch[];
  energy: ResearchFact[];
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
  // Which underlying data actually fed the prompt — computed from what was
  // non-empty, not asked of the model, so it can't hallucinate a citation.
  sources: string[];
  // Sections composed into one plain-text document (the article page
  // renders body as pre-wrap text), ready to prefill the editor.
  body: string;
}

// One country's top trade partners for its latest reported year (UN
// Comtrade, current US$). Served by GET /macro/trade/:countryId.
export interface TradePartnerEntry {
  partnerId: string;
  partnerName: string;
  flagEmoji: string | null;
  valueUsd: number;
}

export interface TradePartnersResponse {
  countryId: string;
  year: number;
  exports: TradePartnerEntry[];
  imports: TradePartnerEntry[];
}

// One country's Country Health score history + latest component breakdown.
// Served by GET /macro/scores/:countryId.
export interface CountryScoreHistoryEntry {
  period: string;
  value: number;
  methodology: string;
}

export interface CountryScoreResponse {
  countryId: string;
  scoreName: string;
  history: CountryScoreHistoryEntry[];
  latestComponents: Record<string, number> | null;
}

// UCDP conflict-intensity series for one country. Served by
// GET /macro/conflict/:countryId.
export interface ConflictMonthEntry {
  month: string; // YYYY-MM-DD
  events: number;
  deaths: number;
  stateBased: number;
  nonState: number;
  oneSided: number;
}

export interface ConflictSeriesResponse {
  countryId: string;
  months: ConflictMonthEntry[];
  trailing12m: { events: number; deaths: number };
}

// Per-country trailing-12m totals for every country with recorded
// activity — served by GET /macro/conflict-summary, powers the map's
// conflict-intensity layer (one call instead of ~200 per-country ones).
export interface ConflictSummaryEntry {
  countryId: string;
  events: number;
  deaths: number;
}

// Global energy benchmark (Brent/WTI/Henry Hub spot), latest value + 30-day
// change. Series is not per-country — these are world reference prices.
// Served by GET /macro/energy.
export interface EnergyBenchmarkEntry {
  series: string;
  name: string;
  latestPeriod: string; // YYYY-MM-DD
  value: number;
  units: string;
  change30dPct: number | null;
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
  official: boolean;
  countryId: string | null;
  fetchIntervalMinutes: number;
  lastFetched: string | null;
  articleCount: number;
  createdAt: string;
}

// GET /admin/analysis/ollama-status — local-LLM dashboard health tile.
export interface OllamaStatus {
  reachable: boolean;
  model: string;
}

// ─────────────────────────────────────────────
// Entity Resolution (corporate/sanctions intelligence)
// ─────────────────────────────────────────────

// GET /entities?q=
export interface EntitySearchResult {
  id: string;
  entityType: string;
  canonicalName: string;
  aliases: string[];
  sanctionCount: number;
}

interface EntitySourceRef {
  source: { name: string } | null;
}

export interface EntityAliasEntry extends EntitySourceRef {
  id: string;
  name: string;
}

export interface EntityIdentifierEntry extends EntitySourceRef {
  id: string;
  type: string;
  value: string;
  countryId: string;
}

export interface EntitySanctionEntry extends EntitySourceRef {
  id: string;
  regime: string;
  program: string;
}

export interface EntityOfficerEntry extends EntitySourceRef {
  id: string;
  name: string;
  role: string;
  countryId: string | null;
}

export interface EntitySourceLinkEntry {
  externalId: string;
  fetchedAt: string;
  source: { name: string } | null;
}

export interface EntityRelationshipEntry {
  parent?: { id: string; canonicalName: string };
  child?: { id: string; canonicalName: string };
}

// GET /entities/:id
export interface EntityDetail {
  id: string;
  entityType: string;
  canonicalName: string;
  primaryCountryId: string | null;
  website: string | null;
  status: string | null;
  industryCode: string | null;
  industryLabel: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  createdAt: string;
  updatedAt: string;
  aliases: EntityAliasEntry[];
  identifiers: EntityIdentifierEntry[];
  sanctions: EntitySanctionEntry[];
  officers: EntityOfficerEntry[];
  sourceLinks: EntitySourceLinkEntry[];
  relationshipsAsChild: EntityRelationshipEntry[];
  relationshipsAsParent: EntityRelationshipEntry[];
}

// GET /admin/entity-resolution/reviews
export interface EntityMergeReviewEntry {
  id: string;
  confidence: number; // 0-100
  matchedOn: {
    method?: 'fuzzy' | 'llm';
    nameSimilarity?: number;
    countryMatch?: boolean;
    llmSecondPassChecked?: boolean;
    llmSecondPassReasoning?: string;
    [key: string]: unknown;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  entityACanonicalName: string | null;
  entityBCanonicalName: string | null;
  entityA: { id: string; canonicalName: string; primaryCountryId: string | null; aliases: { name: string }[] } | null;
  entityB: { id: string; canonicalName: string; primaryCountryId: string | null; aliases: { name: string }[] } | null;
}

export interface Article {
  id: string;
  sourceId?: string | null;
  source?: Pick<Source, 'id' | 'name' | 'type' | 'official'>;
  countryId: string | null;
  country?: Pick<Country, 'id' | 'name' | 'flagEmoji'> & { status?: CountryStatus };
  url: string;
  title: string;
  body?: string | null;
  publishedAt: string | null;
  language?: string;
  category: EventCategory | null;
  contentType?: ArticleContentType | null;
  tags: string[];
  aiSummary: string | null;
  aiSummaryApproved?: boolean;
  sentimentScore: number | null;
  imageUrl?: string | null;
  published?: boolean;
  status?: ArticleStatus;
  scheduledAt?: string | null;
  author?: { id: string; name: string; avatarUrl: string | null } | null;
  fetchedAt?: string;
  createdAt?: string;
  // Only present on GET /articles/most-read responses.
  viewCount?: number;
}

// ─────────────────────────────────────────────
// Editorial workspace (admin panel)
// ─────────────────────────────────────────────

// Personal to-do item — "My tasks" widget + Tasks section.
export interface EditorialTask {
  id: string;
  title: string;
  done: boolean;
  deadline: string | null; // ISO date-time
  priority: TaskPriority;
  createdAt: string;
}

// GET /admin/dashboard/stats — everything the dashboard header cards need.
export interface DashboardStats {
  statusCounts: Record<ArticleStatus, number>;
  totalArticles: number;
  // Stories created (drafts) / went live (published) in the trailing 7 days.
  weeklyNew: { published: number; drafts: number };
  views30d: number;
  // Percent change vs the preceding 30-day window; null when no baseline.
  viewsChangePct: number | null;
  openTasks: number;
  comments7d: number;
  unreadMessages: number;
  pendingEntityReviews: number;
}

// ─────────────────────────────────────────────
// Analytics (admin)
// ─────────────────────────────────────────────

export interface ViewsAnalytics {
  days: number;
  total: number;
  changePct: number | null;
  daily: Array<{ date: string; views: number }>;
  topArticles: Array<{
    id: string;
    title: string;
    status: ArticleStatus;
    category: EventCategory | null;
    views: number;
  }>;
}

export interface AudienceAnalytics {
  days: number;
  uniqueVisitors: number;
  totalViews: number;
  viewsPerVisitor: number;
  returningVisitors: number;
  daily: Array<{ date: string; visitors: number }>;
}

export interface ReferrerAnalytics {
  days: number;
  total: number;
  sources: Array<{ source: string; views: number; visitors: number; sharePct: number }>;
}

// ─────────────────────────────────────────────
// Tools (admin)
// ─────────────────────────────────────────────

export interface MediaItem {
  filename: string;
  url: string;
  sizeBytes: number;
  uploadedAt: string;
  usedBy: { kind: 'article' | 'avatar'; id: string; label: string } | null;
}

export interface TagStat {
  tag: string;
  count: number;
}

// ─────────────────────────────────────────────
// Messages (admin)
// ─────────────────────────────────────────────

export interface MessagePeer {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  unread: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface ThreadMessage {
  id: string;
  body: string;
  mine: boolean;
  createdAt: string;
  readAt: string | null;
}

// ─────────────────────────────────────────────
// Editor workspace (article editor)
// ─────────────────────────────────────────────

// Content snapshot in the editor's History panel.
export interface ArticleRevisionEntry {
  id: string;
  title: string;
  aiSummary: string | null;
  body: string | null;
  status: ArticleStatus;
  createdAt: string;
  words: number;
}

export type AssistMode = 'improve' | 'headline' | 'summary' | 'tags' | 'translate' | 'tone';

// POST /admin/analysis/assist — editor copilot result.
export interface AssistResult {
  mode: AssistMode;
  result: string;
  // headline/tags modes return multiple options to pick from.
  variants?: string[];
}

// GET /admin/articles/:id/related — deterministic related-stories lookup.
export interface RelatedStory {
  id: string;
  title: string;
  category: EventCategory | null;
  publishedAt: string | null;
}

// One story on the publication calendar (month view).
export interface CalendarEntry {
  id: string;
  title: string;
  status: ArticleStatus;
  // The day the story occupies on the calendar: publishedAt for published,
  // scheduledAt for scheduled, createdAt otherwise. ISO date-time.
  date: string;
}

// Admin comments moderation row — comment + enough article context to judge it.
export interface AdminComment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  article: { id: string; title: string };
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
