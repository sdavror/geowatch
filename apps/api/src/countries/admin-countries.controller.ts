import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { UpdateCountryStatusDto } from './dto/update-country-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin/countries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class AdminCountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCountryStatusDto) {
    return this.countriesService.updateStatus(id, dto);
  }
}
