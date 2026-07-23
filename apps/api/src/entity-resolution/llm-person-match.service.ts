import { Injectable, Logger } from '@nestjs/common';
import { OllamaClient } from '../analysis/ollama.client';

export interface LlmPersonMatchJudgment {
  isMatch: boolean;
  confidence: number; // 0-100, the model's own stated confidence
  reasoning: string;
}

function buildPrompt(
  nameA: string,
  countryA: string,
  roleA: string,
  nameB: string,
  countryB: string,
  roleB: string,
): string {
  return `You are verifying whether two company-officer records refer to the SAME real individual person. Only a name, country, and company role are available — no date of birth or national ID was found to confirm this automatically.

Record A: "${nameA}" (country: ${countryA || 'unknown'}, role: ${roleA})
Record B: "${nameB}" (country: ${countryB || 'unknown'}, role: ${roleB})

Rules:
- Word order and formatting differences ("Last, First" vs "First Last") and titles (Mr/Dr/Prof) never matter — ignore them.
- Transliteration differences (Cyrillic to Latin) can still be the same person.
- A common short name (e.g. a very ordinary first+last name combination) is WEAK evidence by itself — many unrelated real people share common names. Only mark isMatch true for a common name if the country matches and nothing else contradicts it.
- An unusual or distinctive full name is much stronger evidence than a common one.
- Being a director/officer of two clearly unrelated companies in different countries is NOT evidence they're the same person — that's just as consistent with two different people who happen to share a name.
- A false match here wrongly links an unrelated real individual to a company's leadership, which is a worse mistake than missing a real duplicate. If you are not clearly confident, set isMatch to false rather than guessing.

Respond with ONLY this JSON object, nothing else:
{"isMatch": true or false, "confidence": 0-100, "reasoning": "one short sentence"}`;
}

/**
 * Phase 3 of Person identity resolution — mirrors LlmEntityMatchService's
 * role exactly (a third signal alongside exact-identifier and fuzzy-name
 * matching, never merges anything itself), but the prompt is written to be
 * skeptical by default: person-name collisions across unrelated companies
 * are far more likely than company-name collisions, so the model is
 * explicitly told to prefer isMatch:false on common names without strong
 * corroborating context. Runs on the same local Ollama instance as every
 * other LLM-assisted matching in this project — zero cloud AI cost.
 */
@Injectable()
export class LlmPersonMatchService {
  private readonly logger = new Logger(LlmPersonMatchService.name);

  constructor(private readonly ollama: OllamaClient) {}

  async judge(
    nameA: string,
    countryA: string | null,
    roleA: string,
    nameB: string,
    countryB: string | null,
    roleB: string,
  ): Promise<LlmPersonMatchJudgment | null> {
    try {
      const result = await this.ollama.generateJson<LlmPersonMatchJudgment>(
        buildPrompt(nameA, countryA ?? '', roleA, nameB, countryB ?? '', roleB),
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
