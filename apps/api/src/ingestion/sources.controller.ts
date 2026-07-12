import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionService } from './ingestion.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/source.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/** Admin: manage ingestion sources and trigger runs by hand. */
@Controller('admin/sources')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class SourcesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  @Get()
  list() {
    return this.prisma.source.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.prisma.source.create({
      data: { name: dto.name, url: dto.url, type: dto.type as never, fetchIntervalMinutes: dto.fetchIntervalMinutes },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    const exists = await this.prisma.source.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Source "${id}" not found`);
    return this.prisma.source.update({ where: { id }, data: dto as never });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const exists = await this.prisma.source.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`Source "${id}" not found`);
    await this.prisma.source.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** Manually trigger a full ingestion run (normally runs every 15 min). */
  @Post('ingest')
  ingest() {
    return this.ingestion.runIngestion();
  }

  /** Manually trigger the stale-draft purge (normally runs daily at 03:00). */
  @Post('purge-stale')
  purgeStale() {
    return this.ingestion.purgeStaleDrafts();
  }
}
