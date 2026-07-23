import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AssistService } from './assist.service';
import { OllamaClient } from './ollama.client';
import { MacroModule } from '../macro/macro.module';
import { EntityResolutionModule } from '../entity-resolution/entity-resolution.module';

@Module({
  imports: [MacroModule, EntityResolutionModule], // EnergyService for event reports; EntityMentionService for named-entity grounding
  controllers: [AnalysisController],
  providers: [AnalysisService, AssistService, OllamaClient],
})
export class AnalysisModule {}
