import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { IngestionService } from './ingestion.service';
import { RssAdapter } from './rss.adapter';
import { NewsApiAdapter } from './newsapi.adapter';
import { TelegramAdapter } from './telegram.adapter';
import { EntityResolutionModule } from '../entity-resolution/entity-resolution.module';

@Module({
  imports: [EntityResolutionModule],
  controllers: [SourcesController],
  providers: [IngestionService, RssAdapter, NewsApiAdapter, TelegramAdapter],
  exports: [IngestionService],
})
export class IngestionModule {}
