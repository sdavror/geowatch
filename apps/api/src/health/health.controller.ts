import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import type { HealthCheck } from '@geowatch/shared-types';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(): Promise<HealthCheck> {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.isHealthy(),
      this.redis.isHealthy(),
    ]);

    return {
      status: dbOk && redisOk ? 'ok' : 'error',
      db: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }
}
