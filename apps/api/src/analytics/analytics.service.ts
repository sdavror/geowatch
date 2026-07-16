import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Editorial analytics over the PageView stream. Everything aggregates in
 * SQL — page_views grows unbounded and must never be pulled row-by-row
 * into Node.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private clampDays(days: number): number {
    return Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
  }

  /** Daily article views + top stories for the trailing window. */
  async views(daysRaw = 30) {
    const days = this.clampDays(daysRaw);
    const from = new Date(Date.now() - days * 86400_000);
    const prevFrom = new Date(Date.now() - 2 * days * 86400_000);

    const [daily, totals, prevTotals] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; views: bigint }>>`
        SELECT date_trunc('day', viewed_at)::date AS day, count(*) AS views
        FROM page_views
        WHERE entity_type = 'article' AND viewed_at >= ${from}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.pageView.count({ where: { entityType: 'article', viewedAt: { gte: from } } }),
      this.prisma.pageView.count({
        where: { entityType: 'article', viewedAt: { gte: prevFrom, lt: from } },
      }),
    ]);

    const grouped = await this.prisma.pageView.groupBy({
      by: ['entityId'],
      where: { entityType: 'article', viewedAt: { gte: from } },
      _count: { entityId: true },
      orderBy: { _count: { entityId: 'desc' } },
      take: 10,
    });
    const articles = await this.prisma.article.findMany({
      where: { id: { in: grouped.map((g) => g.entityId) } },
      select: { id: true, title: true, status: true, category: true },
    });
    const byId = new Map(articles.map((a) => [a.id, a]));

    return {
      days,
      total: totals,
      changePct: prevTotals > 0 ? Math.round(((totals - prevTotals) / prevTotals) * 100) : null,
      daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), views: Number(d.views) })),
      topArticles: grouped
        .filter((g) => byId.has(g.entityId))
        .map((g) => ({
          id: g.entityId,
          title: byId.get(g.entityId)!.title,
          status: byId.get(g.entityId)!.status,
          category: byId.get(g.entityId)!.category,
          views: g._count.entityId,
        })),
    };
  }

  /** Unique visitors (distinct session ids) per day + engagement ratios. */
  async audience(daysRaw = 30) {
    const days = this.clampDays(daysRaw);
    const from = new Date(Date.now() - days * 86400_000);

    const [daily, uniques, views, returning] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: Date; visitors: bigint }>>`
        SELECT date_trunc('day', viewed_at)::date AS day,
               count(DISTINCT session_id) AS visitors
        FROM page_views
        WHERE viewed_at >= ${from} AND session_id IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(DISTINCT session_id) AS n FROM page_views
        WHERE viewed_at >= ${from} AND session_id IS NOT NULL`,
      this.prisma.pageView.count({ where: { viewedAt: { gte: from } } }),
      // Sessions seen on more than one calendar day = returning readers.
      this.prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM (
          SELECT session_id FROM page_views
          WHERE viewed_at >= ${from} AND session_id IS NOT NULL
          GROUP BY session_id
          HAVING count(DISTINCT date_trunc('day', viewed_at)) > 1
        ) s`,
    ]);

    const uniqueVisitors = Number(uniques[0]?.n ?? 0);
    return {
      days,
      uniqueVisitors,
      totalViews: views,
      viewsPerVisitor: uniqueVisitors > 0 ? Math.round((views / uniqueVisitors) * 10) / 10 : 0,
      returningVisitors: Number(returning[0]?.n ?? 0),
      daily: daily.map((d) => ({
        date: d.day.toISOString().slice(0, 10),
        visitors: Number(d.visitors),
      })),
    };
  }

  /** Where readers arrive from — referring host, or "direct". */
  async referrers(daysRaw = 30) {
    const days = this.clampDays(daysRaw);
    const from = new Date(Date.now() - days * 86400_000);

    const rows = await this.prisma.$queryRaw<
      Array<{ source: string; views: bigint; visitors: bigint }>
    >`
      SELECT COALESCE(NULLIF(referrer, ''), 'direct') AS source,
             count(*) AS views,
             count(DISTINCT session_id) AS visitors
      FROM page_views
      WHERE viewed_at >= ${from}
      GROUP BY 1 ORDER BY 2 DESC
      LIMIT 20`;

    const total = rows.reduce((s, r) => s + Number(r.views), 0);
    return {
      days,
      total,
      sources: rows.map((r) => ({
        source: r.source,
        views: Number(r.views),
        visitors: Number(r.visitors),
        sharePct: total > 0 ? Math.round((Number(r.views) / total) * 100) : 0,
      })),
    };
  }
}
