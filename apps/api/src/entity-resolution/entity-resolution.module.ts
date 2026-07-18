import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntityResolutionAdminController } from './entity-resolution-admin.controller';
import { EntityResolutionService } from './entity-resolution.service';
import { EntityIngestionService } from './entity-ingestion.service';
import { EntityMergeReviewService } from './entity-merge-review.service';
import { LlmEntityMatchService } from './llm-entity-match.service';
import { OfacSdnAdapter } from './ofac-sdn.adapter';
import { GleifAdapter } from './gleif.adapter';
import { EuSanctionsAdapter } from './eu-sanctions.adapter';
import { OfsiAdapter } from './ofsi.adapter';
import { OllamaClient } from '../analysis/ollama.client';

@Module({
  controllers: [EntitiesController, EntityResolutionAdminController],
  providers: [
    EntityResolutionService,
    EntityIngestionService,
    EntityMergeReviewService,
    LlmEntityMatchService,
    OllamaClient,
    OfacSdnAdapter,
    GleifAdapter,
    EuSanctionsAdapter,
    OfsiAdapter,
  ],
  exports: [EntityResolutionService, EntityIngestionService],
})
export class EntityResolutionModule {}
