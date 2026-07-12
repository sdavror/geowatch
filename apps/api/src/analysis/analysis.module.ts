import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { OllamaClient } from './ollama.client';

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, OllamaClient],
})
export class AnalysisModule {}
