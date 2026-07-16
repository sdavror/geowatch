import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AssistService } from './assist.service';
import { OllamaClient } from './ollama.client';
import { MacroModule } from '../macro/macro.module';

@Module({
  imports: [MacroModule], // EnergyService — global market context for event reports
  controllers: [AnalysisController],
  providers: [AnalysisService, AssistService, OllamaClient],
})
export class AnalysisModule {}
