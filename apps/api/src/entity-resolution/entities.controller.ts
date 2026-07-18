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
  async search(@Query('q') q?: string) {
    const query = q?.trim();
    const rows = await this.prisma.entity.findMany({
      where: query
        ? {
            OR: [
              { canonicalName: { contains: query, mode: 'insensitive' } },
              { aliases: { some: { name: { contains: query, mode: 'insensitive' } } } },
            ],
          }
        : undefined,
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: {
        aliases: { select: { name: true }, take: 5 },
        sanctions: { select: { regime: true, program: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      canonicalName: r.canonicalName,
      aliases: r.aliases.map((a) => a.name),
      sanctionCount: r.sanctions.length,
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
