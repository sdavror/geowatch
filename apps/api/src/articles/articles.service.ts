import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const cacheKey = `articles:all:${query.category ?? '*'}:${query.countryId ?? '*'}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const where: Prisma.ArticleWhereInput = { published: true };
    if (query.category) where.category = query.category;
    if (query.countryId) where.countryId = query.countryId.toUpperCase();

    // Over-fetch a larger recency-ordered pool, then cap how many of the
    // final `limit` slots any single source can take — otherwise one
    // outlet's posting burst crowds out every other source on the homepage
    // (observed in practice: one RSS feed took 12 of the top 20 slots).
    const pool = await this.prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: Math.min(limit * 4, 100),
      include: { country: true },
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

  /** Records one view for "most read" ranking. Fire-and-forget from the client. */
  async recordView(articleId: string, sessionId?: string) {
    await this.prisma.pageView.create({
      data: { entityType: 'article', entityId: articleId, sessionId },
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
   * `published` filters the moderation queue. Pending items sort oldest
   * first (FIFO — a queue, not a feed) so nothing sits unseen forever once
   * ingestion volume exceeds the page size; published items sort newest
   * first, matching how editors actually want to review each view.
   */
  async findAllAdmin(published?: boolean) {
    const articles = await this.prisma.article.findMany({
      where: published === undefined ? undefined : { published },
      orderBy: { createdAt: published === false ? 'asc' : 'desc' },
      take: 200,
      include: { country: true },
    });
    return articles.map((a) => this.serializeArticle(a, true));
  }

  /** Counts for the admin queue tabs — cheap enough to run alongside the list. */
  async countAdmin() {
    const [pending, published, total] = await Promise.all([
      this.prisma.article.count({ where: { published: false } }),
      this.prisma.article.count({ where: { published: true } }),
      this.prisma.article.count(),
    ]);
    return { pending, published, total };
  }

  async create(input: {
    title: string;
    body?: string | null;
    aiSummary?: string | null;
    category?: string | null;
    countryId?: string | null;
    imageUrl?: string | null;
    published?: boolean;
    authorId: string;
  }) {
    const article = await this.prisma.article.create({
      data: {
        title: input.title,
        body: input.body ?? null,
        aiSummary: input.aiSummary ?? null,
        category: (input.category as never) ?? null,
        countryId: input.countryId ? input.countryId.toUpperCase() : null,
        imageUrl: input.imageUrl ?? null,
        published: input.published ?? false,
        authorId: input.authorId,
        // Editor-authored posts are inherently curated, so the AI-summary
        // approval flag rides along with the publish state.
        aiSummaryApproved: input.published ?? false,
        // Manually created articles still need a unique url; synthesise one.
        url: `geowatch://article/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        publishedAt: input.published ? new Date() : null,
        tags: [],
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
      countryId?: string | null;
      imageUrl?: string | null;
      published?: boolean;
    },
  ) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Article "${id}" not found`);

    const goingLive = input.published === true && !existing.published;
    const article = await this.prisma.article.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary } : {}),
        ...(input.category !== undefined ? { category: input.category as never } : {}),
        ...(input.countryId !== undefined
          ? { countryId: input.countryId ? input.countryId.toUpperCase() : null }
          : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.published !== undefined
          ? { published: input.published, aiSummaryApproved: input.published }
          : {}),
        ...(goingLive && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
      include: { country: true },
    });
    await this.invalidate(id);
    return this.serializeArticle(article, true);
  }

  async remove(id: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Article "${id}" not found`);
    await this.prisma.article.delete({ where: { id } });
    await this.invalidate(id);
    return { deleted: true, id };
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
      tags: string[];
      aiSummary: string | null;
      sentimentScore: Prisma.Decimal | null;
      imageUrl?: string | null;
      published?: boolean;
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
      tags: a.tags,
      aiSummary: a.aiSummary,
      sentimentScore: a.sentimentScore ? Number(a.sentimentScore) : null,
      imageUrl: a.imageUrl ?? null,
      published: a.published ?? false,
    };
  }
}
