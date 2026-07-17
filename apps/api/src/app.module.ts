import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis.module';
import { HealthModule } from './health/health.module';
import { CountriesModule } from './countries/countries.module';
import { ArticlesModule } from './articles/articles.module';
import { GdpModule } from './gdp/gdp.module';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { CommentsModule } from './comments/comments.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MacroModule } from './macro/macro.module';
import { AnalysisModule } from './analysis/analysis.module';
import { TasksModule } from './tasks/tasks.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MessagesModule } from './messages/messages.module';
import { EntityResolutionModule } from './entity-resolution/entity-resolution.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute window
        limit: 100, // 100 requests/min per IP — matches architecture doc
      },
    ]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UploadModule,
    CommentsModule,
    CountriesModule,
    ArticlesModule,
    GdpModule,
    IngestionModule,
    MacroModule,
    AnalysisModule,
    TasksModule,
    AnalyticsModule,
    MessagesModule,
    EntityResolutionModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

