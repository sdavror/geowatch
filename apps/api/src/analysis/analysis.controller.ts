import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { AnalyzeEventDto } from './dto/event.dto';
import { OllamaClient } from './ollama.client';
import { AssistService, ASSIST_MODES, type AssistMode } from './assist.service';

class AssistDto {
  @IsIn(ASSIST_MODES)
  mode!: AssistMode;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(30000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  selection?: string;
}
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
    private readonly assistService: AssistService,
  ) {}

  /**
   * Editor copilot: improve / headline / summary / tags / translate / tone.
   * Works purely on the article's own text (local LLM, ~10-60s).
   */
  @Post('assist')
  assist(@Body() dto: AssistDto) {
    return this.assistService.assist(dto);
  }

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

  /**
   * Raw research brief for a journalist: verifiable facts with periods,
   * primary-source links, own coverage. No LLM — instant, deterministic.
   */
  @Post('research')
  researchBrief(@Body() dto: AnalyzeEventDto) {
    return this.analysis.generateResearchBrief(dto.text);
  }
}
