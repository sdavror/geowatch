import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Public read API for resolved entities — the payoff of the whole pipeline:
 * one company, its aliases across every source it was seen under, every
 * identifier that ties it together, every sanction listing, and which raw
 * source records fed it.
 */
@Controller('entities')
export class EntitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(
    @Query('q') q?: string,
    @Query('all') all?: string,
    @Query('limit') limitParam?: string,
    @Query('offset') offsetParam?: string,
  ) {
    const query = q?.trim();
    // Capped at 100/page — plenty for "load more" browsing without letting
    // an unbounded limit param turn this into an accidental full-table dump.
    const limit = Math.min(Math.max(parseInt(limitParam ?? '', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(offsetParam ?? '', 10) || 0, 0);
    // Default (no search query) view: hide SEC EDGAR's ~8k reference-only
    // US public companies — they're never sanctioned themselves, added
    // purely so a sanctioned entity that also has SEC filings can
    // cross-reference by CIK, and without this filter they dominate the
    // "recently touched" browse view over the entities this tool actually
    // exists to surface. An explicit name search still searches everything
    // (a real name match is a real name match); `all=true` opts back into
    // browsing the unfiltered pool.
    const restrictToSanctioned = !query && all !== 'true';

    const rows = await this.prisma.entity.findMany({
      where: {
        ...(query
          ? {
              OR: [
                { canonicalName: { contains: query, mode: 'insensitive' } },
                { aliases: { some: { name: { contains: query, mode: 'insensitive' } } } },
              ],
            }
          : {}),
        ...(restrictToSanctioned ? { sanctions: { some: {} } } : {}),
      },
      take: limit,
      skip: offset,
      // Browsing (no query): most-sanctioned first, so the entities this
      // tool exists for lead the list instead of whatever was last
      // touched by an unrelated enrichment sweep. Searching: most-recently
      // resolved first, same as before.
      orderBy: query ? { updatedAt: 'desc' } : { sanctions: { _count: 'desc' } },
      include: {
        aliases: { select: { name: true }, take: 5 },
        sanctions: { select: { regime: true, program: true } },
        _count: { select: { relationshipsAsParent: true, relationshipsAsChild: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      canonicalName: r.canonicalName,
      primaryCountryId: r.primaryCountryId,
      aliases: r.aliases.map((a) => a.name),
      sanctionCount: r.sanctions.length,
      subsidiaryCount: r._count.relationshipsAsParent,
      hasParent: r._count.relationshipsAsChild > 0,
    }));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { id },
      include: {
        aliases: { include: { source: { select: { name: true } } } },
        identifiers: { include: { source: { select: { name: true } } } },
        sanctions: { include: { source: { select: { name: true } } } },
        officers: { include: { source: { select: { name: true } } } },
        sourceLinks: { select: { externalId: true, fetchedAt: true, source: { select: { name: true } } } },
        // Both directions: who owns this entity, and what it owns.
        relationshipsAsChild: { include: { parent: { select: { id: true, canonicalName: true } } } },
        relationshipsAsParent: { include: { child: { select: { id: true, canonicalName: true } } } },
      },
    });
    if (!entity) throw new NotFoundException(`Entity "${id}" not found`);
    return entity;
  }
}
