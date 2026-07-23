import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { matchEntityMentions, type EntityMentionCandidate } from './entity-mention-matcher.util';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — the sanctioned-entity pool changes on a weekly ingest cadence at most

/**
 * Resolves which SANCTIONED entities an article's text names, and records
 * the link. Scoped to sanctioned entities only (not the full ~20k-entity
 * pool) — the actual product need is "a sanctioned company mentioned in an
 * article should resolve," not general company-mention extraction, and that
 * scope keeps a per-article scan fast (~10k candidates vs ~20k+).
 */
@Injectable()
export class EntityMentionService {
  private readonly logger = new Logger(EntityMentionService.name);
  private cache: EntityMentionCandidate[] | null = null;
  private cacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  private async getCandidates(): Promise<EntityMentionCandidate[]> {
    if (this.cache && Date.now() < this.cacheExpiresAt) return this.cache;

    const entities = await this.prisma.entity.findMany({
      where: { sanctions: { some: {} } },
      select: { id: true, canonicalName: true, aliases: { select: { name: true } } },
    });
    const candidates: EntityMentionCandidate[] = [];
    for (const e of entities) {
      candidates.push({ entityId: e.id, name: e.canonicalName });
      for (const a of e.aliases) candidates.push({ entityId: e.id, name: a.name });
    }
    this.cache = candidates;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    this.logger.log(`Entity-mention candidate pool refreshed: ${entities.length} sanctioned entities, ${candidates.length} names`);
    return candidates;
  }

  /** Scans one article's text, links any sanctioned-entity mentions, and marks it scanned either way. */
  async scanArticle(articleId: string, title: string, body: string | null): Promise<number> {
    const candidates = await this.getCandidates();
    const matches = matchEntityMentions(`${title}\n${body ?? ''}`, candidates);

    for (const m of matches) {
      await this.prisma.articleEntity.upsert({
        where: { articleId_entityId: { articleId, entityId: m.entityId } },
        create: { articleId, entityId: m.entityId, matchedText: m.matchedText },
        update: {},
      });
    }
    await this.prisma.article.update({
      where: { id: articleId },
      data: { entityMentionsScannedAt: new Date() },
    });
    return matches.length;
  }

  /**
   * Works through not-yet-scanned articles in batches — call repeatedly to
   * cover the full backlog (same "call again to keep working through the
   * remainder" shape as EntityMergeReviewService.llmJudgeUnreviewedFuzzy).
   * `entityMentionsScannedAt: null` is what makes this converge: a
   * zero-match article still gets marked scanned, so it's never picked up
   * twice.
   */
  async backfill(limit = 1000): Promise<{ scanned: number; linked: number }> {
    const articles = await this.prisma.article.findMany({
      where: { entityMentionsScannedAt: null },
      select: { id: true, title: true, body: true },
      take: limit,
      orderBy: { publishedAt: 'desc' },
    });

    let linked = 0;
    for (const a of articles) {
      const n = await this.scanArticle(a.id, a.title, a.body);
      if (n > 0) linked++;
    }
    this.logger.log(`Entity-mention backfill: ${articles.length} scanned, ${linked} got at least one match`);
    return { scanned: articles.length, linked };
  }
}
