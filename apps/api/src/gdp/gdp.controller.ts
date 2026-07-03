import { Controller, Get, Param, Post } from '@nestjs/common';
import { GdpService } from './gdp.service';

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
export class AdminGdpController {
  constructor(private readonly gdpService: GdpService) {}

  /** Manually trigger a full World Bank refresh (normally runs daily). */
  @Post('refresh')
  refresh() {
    return this.gdpService.refreshAll();
  }
}
