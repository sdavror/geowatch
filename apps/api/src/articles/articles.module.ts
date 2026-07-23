import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { AdminArticlesController } from './admin-articles.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminTagsController } from './admin-tags.controller';
import { ArticlesService } from './articles.service';
import { ScheduledPublisherService } from './scheduled-publisher.service';
import { EntityResolutionModule } from '../entity-resolution/entity-resolution.module';

@Module({
  imports: [EntityResolutionModule],
  controllers: [ArticlesController, AdminArticlesController, AdminDashboardController, AdminTagsController],
  providers: [ArticlesService, ScheduledPublisherService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
