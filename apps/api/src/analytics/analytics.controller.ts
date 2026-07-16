import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('views')
  views(@Query('days') days?: string) {
    return this.analytics.views(Number(days) || 30);
  }

  @Get('audience')
  audience(@Query('days') days?: string) {
    return this.analytics.audience(Number(days) || 30);
  }

  @Get('referrers')
  referrers(@Query('days') days?: string) {
    return this.analytics.referrers(Number(days) || 30);
  }
}
