import { Controller, Get, Param, Query } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { ListCountriesQueryDto } from './dto/list-countries-query.dto';
import { RiskHistoryQueryDto } from './dto/risk-history-query.dto';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  findAll(@Query() query: ListCountriesQueryDto) {
    return this.countriesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.countriesService.findOne(id);
  }

  @Get(':id/risk-history')
  getRiskHistory(@Param('id') id: string, @Query() query: RiskHistoryQueryDto) {
    return this.countriesService.getRiskHistory(id, query);
  }
}
