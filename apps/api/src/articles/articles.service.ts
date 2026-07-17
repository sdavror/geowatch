import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';

const CACHE_TTL_LIST_SECONDS = 60; // short TTL — this is a live news feed
const CACHE_TTL_DETAIL_SECONDS = 300;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(query: ListArticlesQueryDto) {
    const limit = query.limit ?? 20;
    const cacheKey = `articles:all:${query.category ?? '*'}:${query.countryId ?? '*'}:${query.kind ?? '*'}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const where: Prisma.ArticleWhereInput = { published: true };
    if (query.category) where.category = query.category;
    if (query.countryId) where.countryId = query.countryId.toUpperCase();
    // Newsroom-authored analysis vs ingested wire — the homepage splits
    // these into separate columns.
    if (query.kind === 'editorial') where.authorId = { not: null };
    if (query.kind === 'news') where.sourceId = { not: null };

    // Over-fetch a larger recency-ordered pool, then cap how many of the
    // final `limit` slots any single source can take — otherwise one
    // outlet's posting burst crowds out every other source on the homepage
    // (observed in practice: one RSS feed took 12 of the top 20 slots).
    const pool = await this.prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: Math.min(limit * 4, 100),
      include: {
        country: true,
        // The homepage news rail attributes each wire item to its outlet.
        source: { select: { id: true, name: true, type: true, official: true } },
      },
    });

    const diversified = this.applySourceDiversity(pool, limit);
    const serialized = diversified.map((a) => this.serializeArticle(a));
    await this.redis.set(cacheKey, serialized, CACHE_TTL_LIST_SECONDS);
    return serialized;
  }

  /**
   * Keeps at most 40% of the returned slots from any one source, backfilling
   * from the overflow (in original recency order) if too few sources are
   * active to fill `limit` otherwise. Re-sorts by recency at the end, so
   * diversity changes *which* articles are included, not the display order.
   */
  private applySourceDiversity<T extends { sourceId: string | null; publishedAt: Date | null }>(
    pool: T[],
    limit: number,
  ): T[] {
    const maxPerSource = Math.max(2, Math.ceil(limit * 0.4));
    const counts = new Map<string, number>();
    const picked: T[] = [];
    const deferred: T[] = [];

    for (const article of pool) {
      if (picked.length >= limit) break;
      const key = article.sourceId ?? 'none';
      const count = counts.get(key) ?? 0;
      if (count < maxPerSource) {
        picked.push(article);
        counts.set(key, count + 1);
      } else {
        deferred.push(article);
      }
    }
    for (const article of deferred) {
      if (picked.length >= limit) break;
      picked.push(article);
    }

    return picked.sort(
      (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  }

  /** Records one view for "most read" ranking + analytics. Fire-and-forget from the client. */
  async recordView(articleId: string, sessionId?: string, referrer?: string) {
    await this.prisma.pageView.create({
      data: {
        entityType: 'article',
        entityId: articleId,
        sessionId,
        referrer: referrer?.trim().toLowerCase().slice(0, 120) || null,
      },
    });
    return { recorded: true };
  }

  /**
   * Most-read articles over the trailing window, ranked by raw view count.
   * Grouped in SQL (page_views can grow large; we never pull raw rows into
   * Node) then joined back to published articles, preserving the view-count
   * order and dropping any view rows for since-unpublished/deleted articles.
   */
  async findMostRead(days = 7, limit = 6) {
    const cacheKey = `articles:most-read:${days}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const grouped = await this.prisma.pageView.groupBy({
      by: ['entityId'],
      where: { entityType: 'article', viewedAt: { gte: since } },
      _count: { entityId: true },
      orderBy: { _count: { entityId: 'desc' } },
      take: limit * 2, // headroom for unpublished/deleted ids we'll filter out
    });
    if (grouped.length === 0) return [];

    const viewCounts = new Map(grouped.map((g) => [g.entityId, g._count.entityId]));
    const articles = await this.prisma.article.findMany({
      where: { id: { in: grouped.map((g) => g.entityId) }, published: true },
      include: { country: true },
    });

    const ranked = articles
      .sort((a, b) => (viewCounts.get(b.id) ?? 0) - (viewCounts.get(a.id) ?? 0))
      .slice(0, limit)
      .map((a) => ({ ...this.serializeArticle(a), viewCount: viewCounts.get(a.id) ?? 0 }));

    await this.redis.set(cacheKey, ranked, CACHE_TTL_LIST_SECONDS);
    return ranked;
  }

  // ── Admin CRUD ─────────────────────────────────────────────
  // Editors and the owner manage the news catalogue here. The admin list
  // shows drafts too (unlike the public feed, which is published-only).

  /**
   * Admin list, filterable by legacy `published` boolean, workflow `status`,
   * or a title search. The review queue (in_review) sorts oldest first
   * (FIFO — a queue, not a feed) so nothing sits unseen forever once
   * ingestion volume exceeds the page size; everything else sorts newest
   * first, matching how editors actually review those views.
   */
  async findAllAdmin(filter?: {
    published?: boolean;
    status?: ArticleStatus;
    q?: string;
    authorId?: string;
    tag?: string;
  }) {
    const where: Prisma.ArticleWhereInput = {};
    if (filter?.published !== undefined) where.published = filter.published;
    if (filter?.status) where.status = filter.status;
    if (filter?.q) where.title = { contains: filter.q, mode: 'insensitive' };
    if (filter?.authorId) where.authorId = filter.authorId;
    if (filter?.tag) where.tags = { has: filter.tag };

    const queueOrder = filter?.status === 'in_review' || filter?.published === false;
    const articles = await this.prisma.article.findMany({
      where,
      orderBy: { createdAt: queueOrder ? 'asc' : 'desc' },
      take: 200,
      include: {
        country: true,
        source: { select: { id: true, name: true, type: true, official: true } },
        author: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
    });
    return articles.map((a) => this.serializeArticle(a, true));
  }

  /** Counts for the admin queue tabs — cheap enough to run alongside the list. */
  async countAdmin() {
    const [pending, published, total, byStatus] = await Promise.all([
      this.prisma.article.count({ where: { published: false } }),
      this.prisma.article.count({ where: { published: true } }),
      this.prisma.article.count(),
      this.statusCounts(),
    ]);
    return { pending, published, total, byStatus };
  }

  private async statusCounts(): Promise<Record<ArticleStatus, number>> {
    const grouped = await this.prisma.article.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = {
      idea: 0,
      draft: 0,
      in_review: 0,
      ready: 0,
      scheduled: 0,
      published: 0,
      archived: 0,
    } as Record<ArticleStatus, number>;
    for (const g of grouped) counts[g.status] = g._count._all;
    return counts;
  }

  /**
   * Dashboard header numbers in one call. Views compare the trailing 30 days
   * to the 30 before that; null change when there's no baseline yet.
   */
  async dashboardStats(userId: string) {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400_000);
    const d30 = new Date(now - 30 * 86400_000);
    const d60 = new Date(now - 60 * 86400_000);

    const [statusCounts, totalArticles, weeklyPublished, weeklyDrafts, views30d, viewsPrev30d, openTasks, comments7d, unreadMessages] =
      await Promise.all([
        this.statusCounts(),
        this.prisma.article.count(),
        this.prisma.article.count({ where: { published: true, publishedAt: { gte: d7 } } }),
        this.prisma.article.count({
          where: { status: { in: ['idea', 'draft'] }, createdAt: { gte: d7 } },
        }),
        this.prisma.pageView.count({ where: { entityType: 'article', viewedAt: { gte: d30 } } }),
        this.prisma.pageView.count({
          where: { entityType: 'article', viewedAt: { gte: d60, lt: d30 } },
        }),
        this.prisma.editorialTask.count({ where: { userId, done: false } }),
        this.prisma.comment.count({ where: { createdAt: { gte: d7 } } }),
        this.prisma.message.count({ where: { toId: userId, readAt: null } }),
      ]);

    return {
      statusCounts,
      totalArticles,
      weeklyNew: { published: weeklyPublished, drafts: weeklyDrafts },
      views30d,
      viewsChangePct:
        viewsPrev30d > 0 ? Math.round(((views30d - viewsPrev30d) / viewsPrev30d) * 100) : null,
      openTasks,
      comments7d,
      unreadMessages,
    };
  }

  /**
   * Stories for one calendar month. A story sits on the day it went (or is
   * planned to go) public: publishedAt → scheduledAt → createdAt fallback.
   * Fetched per-bucket in SQL rather than scanning all articles in Node.
   */
  async calendarMonth(year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    const select = { id: true, title: true, status: true } as const;

    const [published, scheduled, working] = await Promise.all([
      this.prisma.article.findMany({
        where: { status: 'published', publishedAt: { gte: from, lt: to } },
        select: { ...select, publishedAt: true },
        take: 500,
      }),
      this.prisma.article.findMany({
        where: { status: 'scheduled', scheduledAt: { gte: from, lt: to } },
        select: { ...select, scheduledAt: true },
        take: 500,
      }),
      this.prisma.article.findMany({
        where: {
          status: { in: ['idea', 'draft', 'in_review', 'ready'] },
          createdAt: { gte: from, lt: to },
        },
        select: { ...select, createdAt: true },
        take: 500,
      }),
    ]);

    return [
      ...published.map((a) => ({ id: a.id, title: a.title, status: a.status, date: a.publishedAt!.toISOString() })),
      ...scheduled.map((a) => ({ id: a.id, title: a.title, status: a.status, date: a.scheduledAt!.toISOString() })),
      ...working.map((a) => ({ id: a.id, title: a.title, status: a.status, date: a.createdAt.toISOString() })),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * `status` is the workflow source of truth; the legacy `published` boolean
   * is derived from it (and still accepted from older callers, mapped to
   * published/draft). Publishing stamps publishedAt once.
   */
  private resolveStatus(input: { status?: string | null; published?: boolean }, fallback: ArticleStatus): ArticleStatus {
    if (input.status && input.status in ArticleStatus) return input.status as ArticleStatus;
    if (input.published !== undefined) return input.published ? 'published' : 'draft';
    return fallback;
  }

  async create(input: {
    title: string;
    body?: string | null;
    aiSummary?: string | null;
    category?: string | null;
    contentType?: string | null;
    countryId?: string | null;
    imageUrl?: string | null;
    published?: boolean;
    status?: string | null;
    scheduledAt?: string | null;
    tags?: string[];
    authorId: string;
  }) {
    const status = this.resolveStatus(input, 'draft');
    const isLive = status === 'published';
    const article = await this.prisma.article.create({
      data: {
        title: input.title,
        body: input.body ?? null,
        aiSummary: input.aiSummary ?? null,
        category: (input.category as never) ?? null,
        contentType: (input.contentType as never) ?? null,
        countryId: input.countryId ? input.countryId.toUpperCase() : null,
        imageUrl: input.imageUrl ?? null,
        status,
        published: isLive,
        scheduledAt: status === 'scheduled' && input.scheduledAt ? new Date(input.scheduledAt) : null,
        authorId: input.authorId,
        // Editor-authored posts are inherently curated, so the AI-summary
        // approval flag rides along with the publish state.
        aiSummaryApproved: isLive,
        // Manually created articles still need a unique url; synthesise one.
        url: `geowatch://article/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        publishedAt: isLive ? new Date() : null,
        tags: this.sanitizeTags(input.tags),
      },
      include: { country: true },
    });
    await this.invalidate();
    return this.serializeArticle(article, true);
  }

  async update(
    id: string,
    input: {
      title?: string;
      body?: string | null;
      aiSummary?: string | null;
      category?: string | null;
      contentType?: string | null;
      countryId?: string | null;
      imageUrl?: string | null;
      published?: boolean;
      status?: string | null;
      scheduledAt?: string | null;
      tags?: string[];
    },
  ) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Article "${id}" not found`);

    const statusTouched = input.status !== undefined || input.published !== undefined;
    const status = statusTouched ? this.resolveStatus(input, existing.status) : existing.status;
    const isLive = status === 'published';
    const goingLive = statusTouched && isLive && !existing.published;

    // History trail: snapshot the pre-edit content when the status changes,
    // or when content changes and the last snapshot is older than the
    // collapse window — autosave fires every few seconds, but a revision
    // every keystroke would make History unreadable.
    const contentTouched =
      (input.title !== undefined && input.title !== existing.title) ||
      (input.body !== undefined && input.body !== existing.body) ||
      (input.aiSummary !== undefined && input.aiSummary !== existing.aiSummary);
    const statusChanged = statusTouched && status !== existing.status;
    if (contentTouched || statusChanged) {
      const last = await this.prisma.articleRevision.findFirst({
        where: { articleId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const windowMs = 5 * 60_000;
      if (statusChanged || !last || Date.now() - last.createdAt.getTime() > windowMs) {
        await this.prisma.articleRevision.create({
          data: {
            articleId: id,
            title: existing.title,
            aiSummary: existing.aiSummary,
            body: existing.body,
            status: existing.status,
            authorId: existing.authorId,
          },
        });
      }
    }

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary } : {}),
        ...(input.category !== undefined ? { category: input.category as never } : {}),
        ...(input.contentType !== undefined
          ? { contentType: (input.contentType || null) as never }
          : {}),
        ...(input.countryId !== undefined
          ? { countryId: input.countryId ? input.countryId.toUpperCase() : null }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.tags !== undefined ? { tags: this.sanitizeTags(input.tags) } : {}),
        ...(statusTouched ? { status, published: isLive, aiSummaryApproved: isLive } : {}),
        ...(input.scheduledAt !== undefined
          ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }
          : {}),
        ...(goingLive && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
      include: { country: true },
    });
    await this.invalidate(id);
    return this.serializeArticle(article, true);
  }

  /**
   * Auto-publisher for scheduled stories — flips them live once their
   * scheduledAt passes. Runs every minute; the query is a no-op when
   * nothing is due.
   */
  async publishDueScheduled() {
    const due = await this.prisma.article.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
      select: { id: true, publishedAt: true },
    });
    for (const a of due) {
      await this.prisma.article.update({
        where: { id: a.id },
        data: {
          status: 'published',
          published: true,
          aiSummaryApproved: true,
          ...(a.publishedAt ? {} : { publishedAt: new Date() }),
        },
      });
    }
    if (due.length > 0) await this.invalidate();
    return due.length;
  }

  async remove(id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Article "${id}" not found`);
    await this.prisma.article.delete({ where: { id } });
    await this.invalidate(id);
    return { deleted: true, id };
  }

  /**
   * "Find related stories" in the editor — same country first, then same
   * category, published only. Deterministic (no LLM): an editor wants links
   * they can trust instantly.
   */
  async findRelatedAdmin(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { countryId: true, category: true },
    });
    if (!article) throw new NotFoundException(`Article "${articleId}" not found`);

    const base = { published: true, id: { not: articleId } } as const;
    const select = { id: true, title: true, category: true, publishedAt: true } as const;
    const [byCountry, byCategory] = await Promise.all([
      article.countryId
        ? this.prisma.article.findMany({
            where: { ...base, countryId: article.countryId },
            orderBy: { publishedAt: 'desc' },
            take: 4,
            select,
          })
        : Promise.resolve([]),
      article.category
        ? this.prisma.article.findMany({
            where: { ...base, category: article.category },
            orderBy: { publishedAt: 'desc' },
            take: 4,
            select,
          })
        : Promise.resolve([]),
    ]);

    const seen = new Set<string>();
    return [...byCountry, ...byCategory]
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .slice(0, 6)
      .map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        publishedAt: a.publishedAt?.toISOString() ?? null,
      }));
  }

  async listRevisions(articleId: string) {
    const revisions = await this.prisma.articleRevision.findMany({
      where: { articleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return revisions.map((r) => ({
      id: r.id,
      title: r.title,
      aiSummary: r.aiSummary,
      body: r.body,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      words: r.body?.trim() ? r.body.trim().split(/\s+/).length : 0,
    }));
  }

  /**
   * Restores a snapshot's content through the normal update path, so the
   * current state itself gets snapshotted first — restoring is always
   * undoable. Status is deliberately NOT restored (reverting text shouldn't
   * silently unpublish a live story).
   */
  async restoreRevision(articleId: string, revisionId: string) {
    const revision = await this.prisma.articleRevision.findFirst({
      where: { id: revisionId, articleId },
    });
    if (!revision) throw new NotFoundException('Revision not found');

    // Snapshot the current state unconditionally — the autosave collapse
    // window must never swallow this one, or a restore couldn't be undone.
    const current = await this.prisma.article.findUnique({ where: { id: articleId } });
    if (!current) throw new NotFoundException(`Article "${articleId}" not found`);
    await this.prisma.articleRevision.create({
      data: {
        articleId,
        title: current.title,
        aiSummary: current.aiSummary,
        body: current.body,
        status: current.status,
        authorId: current.authorId,
      },
    });

    return this.update(articleId, {
      title: revision.title,
      aiSummary: revision.aiSummary,
      body: revision.body,
    });
  }

  private sanitizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t && t.length <= 50))].slice(0, 12);
  }

  private async invalidate(id?: string) {
    await this.redis.delByPattern('articles:all:*');
    if (id) await this.redis.del(`articles:${id}`);
  }

  async findOne(id: string) {
    const cacheKey = `articles:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { country: true },
    });

    if (!article) {
      throw new NotFoundException(`Article with id "${id}" not found`);
    }

    const result = this.serializeArticle(article, true);
    await this.redis.set(cacheKey, result, CACHE_TTL_DETAIL_SECONDS);
    return result;
  }

  // ── Serialization ──────────────────────────────────
  // includeBody controls whether the full article text is returned — the
  // list view only needs the AI summary, so we skip shipping full bodies
  // (often several paragraphs) over the wire for every feed item.
  private serializeArticle(
    a: {
      id: string;
      countryId: string | null;
      country: {
        id: string;
        name: string;
        flagEmoji: string | null;
        status: string;
      } | null;
      url: string;
      title: string;
      body: string | null;
      publishedAt: Date | null;
      category: string | null;
      contentType?: string | null;
      tags: string[];
      aiSummary: string | null;
      sentimentScore: Prisma.Decimal | null;
      imageUrl?: string | null;
      published?: boolean;
      status?: ArticleStatus;
      scheduledAt?: Date | null;
      createdAt?: Date;
      source?: { id: string; name: string; type: string | null; official: boolean } | null;
      author?: { id: string; displayName: string | null; email: string; avatarUrl: string | null } | null;
    },
    includeBody = false,
  ) {
    return {
      id: a.id,
      countryId: a.countryId,
      country: a.country
        ? {
            id: a.country.id,
            name: a.country.name,
            flagEmoji: a.country.flagEmoji?.trim() ?? null,
            status: a.country.status,
          }
        : null,
      url: a.url,
      title: a.title,
      body: includeBody ? a.body : undefined,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      category: a.category,
      contentType: a.contentType ?? null,
      tags: a.tags,
      aiSummary: a.aiSummary,
      sentimentScore: a.sentimentScore ? Number(a.sentimentScore) : null,
      imageUrl: a.imageUrl ?? null,
      published: a.published ?? false,
      status: a.status ?? undefined,
      scheduledAt: a.scheduledAt?.toISOString() ?? null,
      createdAt: a.createdAt?.toISOString() ?? undefined,
      // Only present when the caller's query included the relation (admin
      // list) — public-facing queries don't fetch it, so this stays undefined.
      source: a.source ?? undefined,
      author: a.author
        ? {
            id: a.author.id,
            name: a.author.displayName?.trim() || a.author.email.split('@')[0],
            avatarUrl: a.author.avatarUrl ?? null,
          }
        : undefined,
    };
  }
}
