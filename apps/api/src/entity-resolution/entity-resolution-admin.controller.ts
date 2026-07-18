import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/jwt.util';
import { EntityIngestionService } from './entity-ingestion.service';
import { EntityMergeReviewService } from './entity-merge-review.service';

class ResolveByNameDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  countryId?: string;
}

/** Admin: manually trigger entity ingestion (normally OFAC runs weekly via cron), and review Phase 2's fuzzy-match queue. */
@Controller('admin/entity-resolution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor')
export class EntityResolutionAdminController {
  constructor(
    private readonly ingestion: EntityIngestionService,
    private readonly reviews: EntityMergeReviewService,
  ) {}

  @Post('ingest/ofac')
  ingestOfac() {
    return this.ingestion.ingestOfac();
  }

  @Post('ingest/eu')
  ingestEu() {
    return this.ingestion.ingestEuSanctions();
  }

  @Post('ingest/ofsi')
  ingestOfsi() {
    return this.ingestion.ingestOfsi();
  }

  @Post('ingest/sec-edgar')
  ingestSecEdgar() {
    return this.ingestion.ingestSecEdgar();
  }

  @Post('enrich/:entityId/gleif')
  enrichGleif(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithGleif(entityId);
  }

  /** Requires the entity to already have an LEI (run enrich/:id/gleif first if needed). */
  @Post('enrich/:entityId/gleif-relationships')
  enrichGleifRelationships(@Param('entityId') entityId: string) {
    return this.ingestion.enrichRelationshipsWithGleif(entityId);
  }

  /** Resolves a bare name (no identifiers) — verification tool now, seed for article-mention linking later. */
  @Post('resolve-by-name')
  resolveByName(@Body() dto: ResolveByNameDto) {
    return this.ingestion.resolveByName(dto.name, dto.countryId);
  }

  @Get('reviews')
  listReviews() {
    return this.reviews.listPending();
  }

  @Post('reviews/:id/approve')
  approveReview(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.reviews.approve(id, user.sub);
  }

  @Post('reviews/:id/reject')
  rejectReview(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.reviews.reject(id, user.sub);
  }
}
