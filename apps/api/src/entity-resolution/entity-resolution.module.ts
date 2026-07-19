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
import { SecEdgarAdapter } from './sec-edgar.adapter';
import { CompaniesHouseAdapter } from './companies-house.adapter';
import { FranceRegistryAdapter } from './france-registry.adapter';
import { CanadaSemaAdapter } from './canada-sema.adapter';
import { AustraliaDfatAdapter } from './australia-dfat.adapter';
import { UsCslAdapter } from './us-csl.adapter';
import { EstoniaRegistryAdapter } from './estonia-registry.adapter';
import { LatviaRegistryAdapter } from './latvia-registry.adapter';
import { NorwayBrregAdapter } from './norway-brreg.adapter';
import { FinlandYtjAdapter } from './finland-ytj.adapter';
import { SwitzerlandZefixAdapter } from './switzerland-zefix.adapter';
import { SlovakiaOrsfAdapter } from './slovakia-orsf.adapter';
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
    SecEdgarAdapter,
    CompaniesHouseAdapter,
    FranceRegistryAdapter,
    CanadaSemaAdapter,
    AustraliaDfatAdapter,
    UsCslAdapter,
    EstoniaRegistryAdapter,
    LatviaRegistryAdapter,
    NorwayBrregAdapter,
    FinlandYtjAdapter,
    SwitzerlandZefixAdapter,
    SlovakiaOrsfAdapter,
  ],
  exports: [EntityResolutionService, EntityIngestionService],
})
export class EntityResolutionModule {}
