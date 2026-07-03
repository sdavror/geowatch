import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { ListCountriesQueryDto } from './dto/list-countries-query.dto';
import { RiskHistoryQueryDto } from './dto/risk-history-query.dto';
import { UpdateCountryStatusDto } from './dto/update-country-status.dto';

const CACHE_TTL_LIST_SECONDS = 300; // 5 min — matches architecture doc
const CACHE_TTL_DETAIL_SECONDS = 120; // 2 min

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(query: ListCountriesQueryDto) {
    const cacheKey = `countries:all:${query.status ?? '*'}:${query.region ?? '*'}:${query.search ?? '*'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const where: Prisma.CountryWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.region) where.region = { contains: query.region, mode: 'insensitive' };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { capital: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const countries = await this.prisma.country.findMany({
      where,
      orderBy: { riskScore: 'desc' },
    });

    const serialized = countries.map((c) => this.serializeCountry(c));
    await this.redis.set(cacheKey, serialized, CACHE_TTL_LIST_SECONDS);
    return serialized;
  }

  async findOne(id: string) {
    const normalizedId = id.toUpperCase();
    const cacheKey = `countries:${normalizedId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const country = await this.prisma.country.findUnique({
      where: { id: normalizedId },
      include: {
        events: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
        articles: {
          orderBy: { publishedAt: 'desc' },
          take: 10,
          where: { aiSummaryApproved: true },
        },
      },
    });

    if (!country) {
      throw new NotFoundException(`Country with id "${id}" not found`);
    }

    const result = {
      ...this.serializeCountry(country),
      events: country.events.map((e) => this.serializeEvent(e)),
      recentArticles: country.articles.map((a) => this.serializeArticle(a)),
    };

    await this.redis.set(cacheKey, result, CACHE_TTL_DETAIL_SECONDS);
    return result;
  }

  async getRiskHistory(id: string, query: RiskHistoryQueryDto) {
    const normalizedId = id.toUpperCase();

    const exists = await this.prisma.country.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Country with id "${id}" not found`);
    }

    const since = new Date();
    since.setDate(since.getDate() - query.days);

    const history = await this.prisma.riskScoreHistory.findMany({
      where: { countryId: normalizedId, computedAt: { gte: since } },
      orderBy: { computedAt: 'asc' },
    });

    return history.map((h) => ({
      id: h.id,
      countryId: h.countryId,
      score: Number(h.score),
      breakdown: h.breakdown,
      computedAt: h.computedAt.toISOString(),
    }));
  }

  /** Admin-only: manually override a country's status */
  async updateStatus(id: string, dto: UpdateCountryStatusDto) {
    const normalizedId = id.toUpperCase();

    const exists = await this.prisma.country.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Country with id "${id}" not found`);
    }

    const updated = await this.prisma.country.update({
      where: { id: normalizedId },
      data: {
        status: dto.status,
        statusOverride: dto.statusOverride ?? true,
      },
    });

    await this.invalidateCache(normalizedId);
    this.logger.log(`Country ${normalizedId} status manually set to ${dto.status}`);

    return this.serializeCountry(updated);
  }

  private async invalidateCache(countryId: string) {
    await Promise.all([
      this.redis.del(`countries:${countryId}`),
      this.redis.delByPattern('countries:all:*'),
    ]);
  }

  // ── Serialization helpers ──────────────────────────────────
  // Prisma returns Decimal/BigInt types that don't serialize to JSON
  // cleanly, so we convert them to plain numbers/strings for API responses.

  private serializeCountry(c: {
    id: string;
    name: string;
    flagEmoji: string | null;
    region: string | null;
    capital: string | null;
    population: bigint | null;
    gdpUsd: bigint | null;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    status: string;
    statusOverride: boolean;
    riskScore: Prisma.Decimal;
    updatedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: c.id,
      name: c.name,
      flagEmoji: c.flagEmoji?.trim() ?? null,
      region: c.region,
      capital: c.capital,
      population: c.population ? Number(c.population) : null,
      gdpUsd: c.gdpUsd ? Number(c.gdpUsd) : null,
      latitude: c.latitude ? Number(c.latitude) : null,
      longitude: c.longitude ? Number(c.longitude) : null,
      status: c.status,
      statusOverride: c.statusOverride,
      riskScore: Number(c.riskScore),
      updatedAt: c.updatedAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    };
  }

  private serializeEvent(e: {
    id: string;
    countryId: string | null;
    title: string;
    description: string | null;
    category: string;
    severity: number;
    startedAt: Date | null;
    endedAt: Date | null;
    sourceUrl: string | null;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: e.id,
      countryId: e.countryId,
      title: e.title,
      description: e.description,
      category: e.category,
      severity: e.severity,
      startedAt: e.startedAt?.toISOString() ?? null,
      endedAt: e.endedAt?.toISOString() ?? null,
      sourceUrl: e.sourceUrl,
      tags: e.tags,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private serializeArticle(a: {
    id: string;
    countryId: string | null;
    url: string;
    title: string;
    publishedAt: Date | null;
    category: string | null;
    tags: string[];
    aiSummary: string | null;
    aiSummaryApproved: boolean;
  }) {
    return {
      id: a.id,
      countryId: a.countryId,
      url: a.url,
      title: a.title,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      category: a.category,
      tags: a.tags,
      aiSummary: a.aiSummary,
      aiSummaryApproved: a.aiSummaryApproved,
    };
  }
}
