import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalyzeEventDto } from './dto/event.dto';
import { OllamaClient } from './ollama.client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/** Admin: generate a draft article/analysis for a country from the macro-intelligence data, via a local LLM. */
@Controller('admin/analysis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor')
export class AnalysisController {
  constructor(
    private readonly analysis: AnalysisService,
    private readonly ollama: OllamaClient,
  ) {}

  /** Dashboard health tile — is the local LLM reachable right now. */
  @Get('ollama-status')
  ollamaStatus() {
    return this.ollama.isReachable();
  }

  @Post('draft/:countryId')
  generateDraft(@Param('countryId') countryId: string) {
    return this.analysis.generateCountryDraft(countryId);
  }

  /**
   * Structured impact assessment of a reported event ("who does this touch,
   * what are the regional macro consequences"), grounded in the involved
   * countries' data plus their regional peers.
   */
  @Post('event')
  analyzeEvent(@Body() dto: AnalyzeEventDto) {
    return this.analysis.generateEventImpact(dto.text);
  }
}
