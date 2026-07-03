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

    const where: Prisma.ArticleWhereInput = { aiSummaryApproved: true };
    if (query.category) where.category = query.category;
    if (query.countryId) where.countryId = query.countryId.toUpperCase();

    const articles = await this.prisma.article.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      include: { country: true },
    });

    const serialized = articles.map((a) => this.serializeArticle(a));
    await this.redis.set(cacheKey, serialized, CACHE_TTL_LIST_SECONDS);
    return serialized;
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
    };
  }
}
