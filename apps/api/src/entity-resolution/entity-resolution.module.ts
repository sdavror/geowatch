import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntityResolutionAdminController } from './entity-resolution-admin.controller';
import { EntityResolutionService } from './entity-resolution.service';
import { EntityIngestionService } from './entity-ingestion.service';
import { OfacSdnAdapter } from './ofac-sdn.adapter';
import { GleifAdapter } from './gleif.adapter';

@Module({
  controllers: [EntitiesController, EntityResolutionAdminController],
  providers: [EntityResolutionService, EntityIngestionService, OfacSdnAdapter, GleifAdapter],
  exports: [EntityResolutionService, EntityIngestionService],
})
export class EntityResolutionModule {}
