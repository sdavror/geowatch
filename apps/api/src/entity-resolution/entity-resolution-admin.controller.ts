import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  @Post('ingest/canada-sema')
  ingestCanadaSema() {
    return this.ingestion.ingestCanadaSema();
  }

  @Post('ingest/australia-dfat')
  ingestAustraliaDfat() {
    return this.ingestion.ingestAustraliaDfat();
  }

  @Post('ingest/us-csl')
  ingestUsCsl() {
    return this.ingestion.ingestUsCsl();
  }

  @Post('ingest/estonia-registry')
  ingestEstoniaRegistry() {
    return this.ingestion.ingestEstoniaRegistry();
  }

  @Post('ingest/latvia-registry')
  ingestLatviaRegistry() {
    return this.ingestion.ingestLatviaRegistry();
  }

  @Post('ingest/japan-mof')
  ingestJapanMof() {
    return this.ingestion.ingestJapanMof();
  }

  @Post('ingest/switzerland-seco')
  ingestSwitzerlandSeco() {
    return this.ingestion.ingestSwitzerlandSeco();
  }

  @Post('ingest/un-security-council')
  ingestUnSecurityCouncil() {
    return this.ingestion.ingestUnSecurityCouncil();
  }

  @Post('enrich/:entityId/gleif')
  enrichGleif(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithGleif(entityId);
  }

  @Post('enrich/:entityId/companies-house')
  enrichCompaniesHouse(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithCompaniesHouse(entityId);
  }

  @Post('enrich/:entityId/france-registry')
  enrichFranceRegistry(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithFranceRegistry(entityId);
  }

  @Post('enrich/:entityId/norway-registry')
  enrichNorwayRegistry(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithNorwayRegistry(entityId);
  }

  @Post('enrich/:entityId/finland-registry')
  enrichFinlandRegistry(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithFinlandRegistry(entityId);
  }

  @Post('enrich/:entityId/switzerland-registry')
  enrichSwitzerlandRegistry(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithSwitzerlandRegistry(entityId);
  }

  @Post('enrich/:entityId/slovakia-registry')
  enrichSlovakiaRegistry(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithSlovakiaRegistry(entityId);
  }

  @Post('enrich/:entityId/ireland-cro')
  enrichIrelandCro(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithIrelandCro(entityId);
  }

  @Post('enrich/:entityId/romania-anaf')
  enrichRomaniaAnaf(@Param('entityId') entityId: string) {
    return this.ingestion.enrichWithRomaniaAnaf(entityId);
  }

  /** Requires the entity to already have an LEI (run enrich/:id/gleif first if needed). */
  @Post('enrich/:entityId/gleif-relationships')
  enrichGleifRelationships(@Param('entityId') entityId: string) {
    return this.ingestion.enrichRelationshipsWithGleif(entityId);
  }

  /** Requires a reg_number@GB identifier (run enrich/:id/companies-house first if needed). */
  @Post('enrich/:entityId/companies-house-psc')
  enrichCompaniesHousePsc(@Param('entityId') entityId: string) {
    return this.ingestion.enrichPscWithCompaniesHouse(entityId);
  }

  /** One-time (safe to re-run) backfill of the Track A company-profile fields for entities ingested before those fields existed. */
  @Post('backfill/company-profile')
  backfillCompanyProfile() {
    return this.ingestion.backfillCompanyProfile();
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

  /**
   * Bulk-approves only the safest tier of the pending queue (near-exact
   * name match, same country, string-similarity method — see
   * EntityMergeReviewService.autoApproveHighConfidence). Everything else
   * stays queued for a human.
   */
  @Post('reviews/auto-approve')
  autoApproveReviews(@CurrentUser() user: TokenPayload) {
    return this.reviews.autoApproveHighConfidence(user.sub);
  }

  /**
   * Extends Phase 3 to the `fuzzy`-method reviews that never got an LLM
   * opinion in the first place (see EntityMergeReviewService.
   * llmJudgeUnreviewedFuzzy). Call repeatedly (default batch 150) to work
   * through the remainder — local inference is slow enough that one huge
   * batch isn't practical.
   */
  @Post('reviews/llm-second-pass')
  llmSecondPassReviews(@CurrentUser() user: TokenPayload, @Query('limit') limit?: string) {
    return this.reviews.llmJudgeUnreviewedFuzzy(user.sub, limit ? parseInt(limit, 10) : undefined);
  }
}
