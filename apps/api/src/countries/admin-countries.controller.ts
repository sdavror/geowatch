import { Body, Controller, Param, Patch } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { UpdateCountryStatusDto } from './dto/update-country-status.dto';

/**
 * ⚠️ TEMPORARY: this controller is NOT yet protected by authentication.
 * Stage 3 adds JWT auth + RolesGuard. Until then, do not expose this API
 * publicly (e.g. don't deploy this build to a public production URL).
 */
@Controller('admin/countries')
export class AdminCountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCountryStatusDto) {
    return this.countriesService.updateStatus(id, dto);
  }
}
