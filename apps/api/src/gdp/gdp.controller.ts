import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { GdpService } from './gdp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('countries')
export class GdpController {
  constructor(private readonly gdpService: GdpService) {}

  @Get(':id/gdp-history')
  getGdpHistory(@Param('id') id: string) {
    return this.gdpService.getGdpHistory(id);
  }

  @Get(':id/population-history')
  getPopulationHistory(@Param('id') id: string) {
    return this.gdpService.getPopulationHistory(id);
  }
}

/**
 * ⚠️ TEMPORARY: not yet protected by authentication — same caveat as
 * AdminCountriesController. Stage 3 adds JWT auth + RolesGuard.
 */
@Controller('admin/gdp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminGdpController {
  constructor(private readonly gdpService: GdpService) {}

  /** Manually trigger a full World Bank refresh (normally runs daily). */
  @Post('refresh')
  refresh() {
    return this.gdpService.refreshAll();
  }
}
