import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../analysis/ollama.client';

export interface LlmMatchJudgment {
  isMatch: boolean;
  confidence: number; // 0-100, the model's own stated confidence
  reasoning: string;
}

function buildPrompt(nameA: string, countryA: string, nameB: string, countryB: string): string {
  return `You are verifying whether two company name records refer to the SAME real-world legal entity. Only names and countries are available — no registration number was found to confirm this automatically.

Record A: "${nameA}" (country: ${countryA || 'unknown'})
Record B: "${nameB}" (country: ${countryB || 'unknown'})

Rules:
- Legal-form suffixes (LLC, PJSC, GmbH, Ltd, PLC, JSC, AO, OOO) never matter — ignore them.
- Transliteration differences (Cyrillic to Latin) and translated names can still be the same company.
- Abbreviations can still be the same company.
- A parent company and its own distinct legal subsidiary are DIFFERENT entities even when clearly related — e.g. "Gazprom Neft" and "Gazprom Neft Kazakhstan LLC" must NOT be marked as a match, because Kazakhstan LLC is its own separately incorporated company.
- If you are not reasonably sure, set isMatch to false rather than guessing.

Respond with ONLY this JSON object, nothing else:
{"isMatch": true or false, "confidence": 0-100, "reasoning": "one short sentence"}`;
}

/**
 * Phase 3: a third signal alongside exact-identifier (Phase 1) and
 * fuzzy-name (Phase 2) matching — catches semantic equivalence that plain
 * string similarity misses (heavier transliteration variants, abbreviations,
 * translated legal names) without ever merging anything itself. Runs
 * entirely on the project's existing local Ollama instance (Qwen2.5 14B) —
 * the same one already used for article analysis — so this adds zero cloud
 * AI cost, consistent with the project's no-AI-budget constraint.
 */
@Injectable()
export class LlmEntityMatchService {
  private readonly logger = new Logger(LlmEntityMatchService.name);

  constructor(private readonly ollama: OllamaClient) {}

  async judge(
    nameA: string,
    countryA: string | null,
    nameB: string,
    countryB: string | null,
  ): Promise<LlmMatchJudgment | null> {
    try {
      const result = await this.ollama.generateJson<LlmMatchJudgment>(
        buildPrompt(nameA, countryA ?? '', nameB, countryB ?? ''),
      );
      if (typeof result.isMatch !== 'boolean' || typeof result.confidence !== 'number') {
        this.logger.warn(`Malformed LLM judgment for "${nameA}" vs "${nameB}": ${JSON.stringify(result)}`);
        return null;
      }
      return result;
    } catch (err) {
      // Ollama being unreachable, slow, or returning garbage must never
      // block ingestion — this is a suggestion source, not a dependency.
      this.logger.warn(`LLM judgment failed for "${nameA}" vs "${nameB}": ${(err as Error).message}`);
      return null;
    }
  }
}
