import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/** Admin: generate a draft article/analysis for a country from the macro-intelligence data, via a local LLM. */
@Controller('admin/analysis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('draft/:countryId')
  generateDraft(@Param('countryId') countryId: string) {
    return this.analysis.generateCountryDraft(countryId);
  }
}
