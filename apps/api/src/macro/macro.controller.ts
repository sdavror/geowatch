import { Controller, Get, NotFoundException, Param, Query, UseGuards, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';
import { MacroService } from './macro.service';
import { TradeService } from './trade.service';
import { EnergyService } from './energy.service';
import { COUNTRY_HEALTH_METHODOLOGY } from './scoring.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const CACHE_TTL_SECONDS = 3600; // this data refreshes at most once a day

/** Public read API for the macro-intelligence layer (economic indicators, sanctions pressure, composite scores). */
@Controller('macro')
export class MacroController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly trade: TradeService,
    private readonly energy: EnergyService,
  ) {}

  /** Global energy benchmarks (Brent/WTI/Henry Hub): latest spot + 30-day change. */
  @Get('energy')
  async energyBenchmarks() {
    const cacheKey = 'macro:energy';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const result = await this.energy.latestBenchmarks();
    if (result.length === 0) {
      throw new NotFoundException('No energy benchmark data loaded yet');
    }
    await this.redis.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /** Top trade partners (latest reported year, UN Comtrade) — exports and imports. */
  @Get('trade/:countryId')
  async tradePartners(@Param('countryId') countryId: string) {
    const id = countryId.toUpperCase();
    const cacheKey = `macro:trade:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;
    const result = await this.trade.topPartners(id);
    if (result.year === null) {
      throw new NotFoundException(`No trade data for country "${id}"`);
    }
    await this.redis.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /** Ranking of every scored country — powers a map/table view. */
  @Get('scores')
  async scores(@Query('name') name = 'country_health') {
    const cacheKey = `macro:scores:${name}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const rows = await this.prisma.countryHealthScore.findMany({
      where: { scoreName: name, methodology: COUNTRY_HEALTH_METHODOLOGY },
      orderBy: { period: 'desc' },
      distinct: ['countryId'],
      include: { country: { select: { name: true, region: true, flagEmoji: true } } },
    });
    const result = rows
      .map((r) => ({
        countryId: r.countryId,
        countryName: r.country.name,
        region: r.country.region,
        flagEmoji: r.country.flagEmoji,
        value: Number(r.value),
        period: r.period.toISOString(),
        components: r.components,
      }))
      .sort((a, b) => b.value - a.value);

    await this.redis.set(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  }

  /** One country's score history + latest breakdown. */
  @Get('scores/:countryId')
  async countryScore(@Param('countryId') countryId: string, @Query('name') name = 'country_health') {
    const id = countryId.toUpperCase();
    const rows = await this.prisma.countryHealthScore.findMany({
      where: { countryId: id, scoreName: name },
      orderBy: { period: 'asc' },
    });
    if (rows.length === 0) {
      throw new NotFoundException(`No "${name}" score for country "${id}"`);
    }
    return {
      countryId: id,
      scoreName: name,
      history: rows.map((r) => ({
        period: r.period.toISOString(),
        value: Number(r.value),
        methodology: r.methodology,
      })),
      latestComponents: rows[rows.length - 1].components,
    };
  }

  /** Raw time series for one indicator — for a chart on a country page. */
  @Get('series/:countryId/:indicatorCode')
  async series(
    @Param('countryId') countryId: string,
    @Param('indicatorCode') indicatorCode: string,
    @Query('since') since?: string,
  ) {
    const id = countryId.toUpperCase();
    const sinceYear = since ? Number(since) : 2000;
    const rows = await this.prisma.economicIndicator.findMany({
      where: { countryId: id, indicatorCode, period: { gte: new Date(sinceYear, 0, 1) } },
      orderBy: { period: 'asc' },
    });
    if (rows.length === 0) {
      throw new NotFoundException(`No data for ${indicatorCode} in country "${id}"`);
    }
    return {
      countryId: id,
      indicatorCode,
      points: rows.map((r) => ({
        period: r.period.toISOString(),
        value: Number(r.value),
        isForecast: r.isForecast,
      })),
    };
  }

  /** Reference list of all indicator codes currently stored. */
  @Get('indicators')
  async indicators() {
    const rows = await this.prisma.economicIndicator.findMany({
      select: { indicatorCode: true, source: true, isForecast: true },
      distinct: ['indicatorCode'],
    });
    return rows;
  }
}

/** Admin: manually trigger a full macro-data refresh (normally runs daily at 06:00). */
@Controller('admin/macro')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor')
export class MacroAdminController {
  constructor(
    private readonly macro: MacroService,
    private readonly trade: TradeService,
    private readonly energy: EnergyService,
  ) {}

  /** Manually refresh the energy benchmarks (normally daily at 05:30). */
  @Post('energy-refresh')
  energyRefresh() {
    return this.energy.refreshAll();
  }

  @Post('refresh')
  refresh() {
    return this.macro.refreshAll();
  }

  /** Full trade refresh is slow (rate-limit pacing) — runs in background, weekly cron covers it normally. */
  @Post('trade-refresh')
  tradeRefresh() {
    void this.trade.refreshAll();
    return { started: true };
  }

  /** Refresh a single country's trade partners synchronously (verification/debug). */
  @Post('trade-refresh/:countryId')
  async tradeRefreshCountry(@Param('countryId') countryId: string) {
    const rows = await this.trade.refreshCountry(countryId);
    return { countryId: countryId.toUpperCase(), rowsUpserted: rows };
  }
}
