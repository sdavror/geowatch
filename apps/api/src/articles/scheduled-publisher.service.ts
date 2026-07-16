import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArticlesService } from './articles.service';

/**
 * Flips scheduled stories live once their scheduledAt passes. Every minute:
 * the underlying query is an indexed count-zero no-op when nothing is due,
 * and per-minute granularity is what the schedule picker in the editor
 * promises.
 */
@Injectable()
export class ScheduledPublisherService {
  private readonly logger = new Logger(ScheduledPublisherService.name);

  constructor(private readonly articles: ArticlesService) {}

  @Cron('0 * * * * *')
  async publishDue() {
    try {
      const published = await this.articles.publishDueScheduled();
      if (published > 0) {
        this.logger.log(`Auto-published ${published} scheduled article(s)`);
      }
    } catch (err) {
      this.logger.error(`Scheduled publish failed: ${(err as Error).message}`);
    }
  }
}
