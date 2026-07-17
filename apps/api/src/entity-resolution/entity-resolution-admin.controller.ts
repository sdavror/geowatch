import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EntityIngestionService } from './entity-ingestion.service';

/** Admin: manually trigger entity ingestion (normally OFAC runs weekly via cron). */
@Controller('admin/entity-resolution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor')
export class EntityResolutionAdminController {
  constructor(private readonly ingestion: EntityIngestionService) {}

  @Post('ingest/ofac')
  ingestOfac() {
    return this.ingestion.ingestOfac();
  }

  @Post('enrich/:entityId/gleif')
  enrichGleif(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithGleif(entityId);
  }
}
