import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

// Tags are free text but must stay array-safe and URL-safe.
const TAG_PATTERN = /^[\p{L}\p{N} _-]+$/u;

class RenameTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  from!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(TAG_PATTERN)
  to!: string;
}

/**
 * Tag management over Article.tags (text[]). Aggregation and bulk edits run
 * in SQL — tags live inside arrays, so Prisma's query API can't group or
 * rewrite them directly.
 */
@Controller('admin/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminTagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const rows = await this.prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
      SELECT unnest(tags) AS tag, count(*) AS count
      FROM articles
      GROUP BY 1 ORDER BY 2 DESC, 1 ASC
      LIMIT 200`;
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  @Patch('rename')
  async rename(@Body() dto: RenameTagDto) {
    const from = dto.from.trim();
    const to = dto.to.trim();
    if (!from || !to || from === to) throw new BadRequestException('Nothing to rename');
    const updated = await this.prisma.$executeRaw`
      UPDATE articles SET tags = array_replace(tags, ${from}, ${to})
      WHERE ${from} = ANY(tags)`;
    return { renamed: from, to, articles: updated };
  }

  @Delete(':tag')
  async remove(@Param('tag') tag: string) {
    const value = tag.trim();
    if (!value || value.length > 50) throw new BadRequestException('Invalid tag');
    const updated = await this.prisma.$executeRaw`
      UPDATE articles SET tags = array_remove(tags, ${value})
      WHERE ${value} = ANY(tags)`;
    return { deleted: value, articles: updated };
  }
}
