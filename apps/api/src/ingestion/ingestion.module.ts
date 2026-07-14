import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller';
import { IngestionService } from './ingestion.service';
import { RssAdapter } from './rss.adapter';
import { NewsApiAdapter } from './newsapi.adapter';
import { TelegramAdapter } from './telegram.adapter';

@Module({
  controllers: [SourcesController],
  providers: [IngestionService, RssAdapter, NewsApiAdapter, TelegramAdapter],
  exports: [IngestionService],
})
export class IngestionModule {}
