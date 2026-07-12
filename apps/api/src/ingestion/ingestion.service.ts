import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { RssAdapter, FetchedItem } from './rss.adapter';
import { NewsApiAdapter } from './newsapi.adapter';
import { contentHash } from './dedup.util';
import { classifyCategory } from './category-classifier.util';
import { matchCountry } from './country-matcher.util';

// Diverse-by-design set of free, no-key RSS feeds spanning different
// regions/outlets — matches the "apolitically about politics" positioning
// better than leaning on a single wire service. Seeded by URL (each row is
// created if missing, so new defaults reach existing databases), editable
// afterward via the admin Sources endpoints.
//
// `official: true` marks government/institution press services rather than
// independent media; `countryId` is the state the outlet speaks for, used as
// a country-classification fallback (a head-of-state feed rarely names its
// own country in headlines). The official set deliberately spans opposing
// sides of current conflicts — publishing every government's own words,
// clearly labeled, is the "without bias" positioning.
const DEFAULT_SOURCES: Array<{ name: string; url: string; official?: boolean; countryId?: string }> = [
  { name: 'BBC World News', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
  { name: 'DW World News', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { name: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  {
    name: 'US State Department',
    url: 'https://www.state.gov/rss-feed/press-releases/feed/',
    official: true,
    countryId: 'US',
  },
  {
    name: 'UK Government',
    url: 'https://www.gov.uk/search/news-and-communications.atom',
    official: true,
    countryId: 'GB',
  },
  {
    name: 'European Commission',
    url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en',
    official: true,
    // Supranational — no single ISO country to attribute statements to.
  },
  {
    name: 'President of Ukraine',
    url: 'https://www.president.gov.ua/en/rss',
    official: true,
    countryId: 'UA',
  },
  {
    name: 'Kremlin',
    url: 'http://en.kremlin.ru/events/all/feed',
    official: true,
    countryId: 'RU',
  },
];

// Wire stories are time-sensitive — a pending draft an editor hasn't acted
// on after two weeks is very unlikely to still be worth publishing, and an
// unbounded pending queue defeats the point of a FIFO moderation queue.
// Published articles are never auto-deleted (a news archive is expected to
// persist), only stale *unreviewed* drafts.
const STALE_DRAFT_RETENTION_DAYS = 14;

export interface IngestionSummary {
  sourcesChecked: number;
  itemsFetched: number;
  articlesCreated: number;
  duplicatesSkipped: number;
  errors: string[];
}

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rss: RssAdapter,
    private readonly newsApi: NewsApiAdapter,
  ) {}

  async onModuleInit() {
    await this.seedDefaultSources();
    // Kick off in the background — never block app startup on network I/O.
    void this.runIngestion();
  }

  /**
   * Runs every 15 minutes, per the ingestion pipeline's design cadence.
   * CronExpression has no EVERY_15_MINUTES member, so this is a raw
   * 6-field (seconds-included) cron string: "at :00/:15/:30/:45 past the hour".
   */
  @Cron('0 */15 * * * *')
  async scheduledRun() {
    await this.runIngestion();
  }

  /** Runs once daily at 03:00 — off-peak, and retention doesn't need finer granularity. */
  @Cron('0 0 3 * * *')
  async scheduledPurge() {
    await this.purgeStaleDrafts();
  }

  async purgeStaleDrafts(): Promise<{ purged: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_DRAFT_RETENTION_DAYS);
    const { count } = await this.prisma.article.deleteMany({
      where: { published: false, createdAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(
        `🗑️ Purged ${count} stale pending draft(s) older than ${STALE_DRAFT_RETENTION_DAYS} days`,
      );
    }
    return { purged: count };
  }

  private async seedDefaultSources() {
    // Per-URL, not a global "any rss rows exist" check — an existing database
    // must still receive defaults added in later releases (e.g. the official
    // government feeds). Rows the admin already edited are left untouched.
    let created = 0;
    for (const s of DEFAULT_SOURCES) {
      const existing = await this.prisma.source.findFirst({ where: { url: s.url }, select: { id: true } });
      if (existing) continue;
      await this.prisma.source.create({
        data: {
          name: s.name,
          type: 'rss',
          url: s.url,
          fetchIntervalMinutes: 15,
          official: s.official ?? false,
          countryId: s.countryId ?? null,
        },
      });
      created++;
    }
    if (created > 0) this.logger.log(`Seeded ${created} default RSS source(s)`);
  }

  async runIngestion(): Promise<IngestionSummary> {
    if (this.running) {
      this.logger.warn('Ingestion already in progress, skipping this trigger');
      return { sourcesChecked: 0, itemsFetched: 0, articlesCreated: 0, duplicatesSkipped: 0, errors: ['already running'] };
    }
    this.running = true;
    const summary: IngestionSummary = {
      sourcesChecked: 0,
      itemsFetched: 0,
      articlesCreated: 0,
      duplicatesSkipped: 0,
      errors: [],
    };

    try {
      const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
      // Only 'rss' sources go through the RSS adapter — a legacy/placeholder
      // 'api'-type row (e.g. the original NewsAPI seed entry) is not a feed
      // and would just fail here; NewsAPI is fetched separately below.
      const sources = await this.prisma.source.findMany({ where: { active: true, type: 'rss' } });

      for (const source of sources) {
        summary.sourcesChecked++;
        let items: FetchedItem[];
        try {
          items = await this.rss.fetch(source.url);
        } catch (err) {
          const msg = `Source "${source.name}" failed: ${err instanceof Error ? err.message : err}`;
          this.logger.error(msg);
          summary.errors.push(msg);
          continue;
        }
        summary.itemsFetched += items.length;

        for (const item of items) {
          const created = await this.ingestOne(item, source.id, countries, source.countryId);
          if (created) summary.articlesCreated++;
          else summary.duplicatesSkipped++;
        }

        await this.prisma.source.update({
          where: { id: source.id },
          data: { lastFetched: new Date() },
        });
      }

      if (this.newsApi.isEnabled()) {
        try {
          const items = await this.newsApi.fetchTopHeadlines();
          summary.itemsFetched += items.length;
          for (const item of items) {
            const created = await this.ingestOne(item, null, countries);
            if (created) summary.articlesCreated++;
            else summary.duplicatesSkipped++;
          }
        } catch (err) {
          const msg = `NewsAPI failed: ${err instanceof Error ? err.message : err}`;
          this.logger.error(msg);
          summary.errors.push(msg);
        }
      }

      if (summary.articlesCreated > 0) {
        await this.redis.delByPattern('articles:all:*');
        await this.redis.delByPattern('articles:most-read:*');
      }

      this.logger.log(
        `✅ Ingestion: ${summary.sourcesChecked} sources, ${summary.itemsFetched} items fetched, ` +
          `${summary.articlesCreated} created, ${summary.duplicatesSkipped} duplicates, ${summary.errors.length} errors`,
      );
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async ingestOne(
    item: FetchedItem,
    sourceId: string | null,
    countries: { id: string; name: string }[],
    sourceCountryId: string | null = null,
  ): Promise<boolean> {
    const hash = contentHash(item.title, item.url);

    const existing = await this.prisma.article.findFirst({
      where: { OR: [{ url: item.url }, { contentHash: hash }] },
      select: { id: true },
    });
    if (existing) return false;

    const category = classifyCategory(item.title, item.body);
    // Title matching first; if the headline names no country, fall back to
    // the source's own state (official feeds speak about "our" policy
    // without naming themselves).
    const countryId = matchCountry(item.title, countries) ?? sourceCountryId;

    try {
      await this.prisma.article.create({
        data: {
          sourceId,
          countryId,
          url: item.url,
          title: item.title,
          body: item.body,
          imageUrl: item.imageUrl,
          publishedAt: item.publishedAt,
          category: category ?? undefined,
          contentHash: hash,
          // Ingested stories land in the moderation queue, not live — no
          // AI/human review has looked at them yet, and an unmoderated feed
          // is a real brand risk for a site whose whole premise is "without
          // bias". An editor approves (Publish) via the existing admin queue.
          published: false,
          tags: [],
        },
      });
      return true;
    } catch (err) {
      // Unique-constraint race (two feeds syndicating the same story in the
      // same run) — treat as a duplicate, not a failure.
      this.logger.warn(`Skipping "${item.title}": ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }
}
