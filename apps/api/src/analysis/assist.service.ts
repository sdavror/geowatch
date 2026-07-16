import { BadRequestException, Injectable } from '@nestjs/common';
import { OllamaClient } from './ollama.client';

export type AssistMode =
  | 'improve'
  | 'headline'
  | 'summary'
  | 'tags'
  | 'translate'
  | 'tone';

export const ASSIST_MODES: AssistMode[] = ['improve', 'headline', 'summary', 'tags', 'translate', 'tone'];

interface AssistInput {
  mode: AssistMode;
  title: string;
  body: string;
  /** Optional selected fragment — assists apply to it instead of the whole body. */
  selection?: string | null;
}

// Every prompt pins the same editorial contract: neutral register, no
// invented facts, English output. The model may only rephrase or condense
// what's already in the text — the journalist supplies the facts.
const EDITORIAL_RULES =
  'Rules: strictly neutral, factual news register ("without bias"). Do NOT invent facts, numbers, names or quotes ' +
  'that are not present in the input text. Keep all factual claims exactly as given. Output in English.';

/**
 * Editor copilot actions on the local LLM. Unlike the analysis drafts these
 * work purely on the article's own text — no country data is injected, so
 * they are fast and can't smuggle in stale figures.
 */
@Injectable()
export class AssistService {
  constructor(private readonly ollama: OllamaClient) {}

  async assist(input: AssistInput): Promise<{ mode: AssistMode; result: string; variants?: string[] }> {
    const target = input.selection?.trim() || input.body.trim();
    if (!target && input.mode !== 'headline') {
      throw new BadRequestException('The article body (or a selection) is empty — nothing to work on.');
    }
    if (input.mode === 'headline' && !target && !input.title.trim()) {
      throw new BadRequestException('Write a few sentences first — headlines are generated from the text.');
    }

    switch (input.mode) {
      case 'improve': {
        const out = await this.ollama.generateJson<{ text: string }>(
          `You are a copy editor at a geopolitical news outlet. Improve the following text: fix grammar, tighten wording, keep paragraph breaks (markdown allowed). Preserve meaning and every fact. ${EDITORIAL_RULES}\n\nTEXT:\n${target.slice(0, 6000)}\n\nRespond as JSON: {"text": "<improved text>"}`,
        );
        return { mode: input.mode, result: this.requireText(out.text) };
      }
      case 'headline': {
        const out = await this.ollama.generateJson<{ headlines: string[] }>(
          `You are a headline editor. Suggest 5 headline options for this story: concise (max 12 words), specific, no clickbait, no ALL CAPS. ${EDITORIAL_RULES}\n\nCURRENT TITLE: ${input.title}\n\nSTORY:\n${target.slice(0, 4000)}\n\nRespond as JSON: {"headlines": ["...", "...", "...", "...", "..."]}`,
        );
        const variants = (out.headlines ?? []).filter((h) => typeof h === 'string' && h.trim()).slice(0, 5);
        if (variants.length === 0) throw new BadRequestException('The model returned no headlines — try again.');
        return { mode: input.mode, result: variants[0], variants };
      }
      case 'summary': {
        const out = await this.ollama.generateJson<{ summary: string }>(
          `Write a 1-2 sentence dek (article summary) for this story: what happened and why it matters. ${EDITORIAL_RULES}\n\nTITLE: ${input.title}\n\nSTORY:\n${target.slice(0, 5000)}\n\nRespond as JSON: {"summary": "<the dek>"}`,
        );
        return { mode: input.mode, result: this.requireText(out.summary) };
      }
      case 'tags': {
        const out = await this.ollama.generateJson<{ tags: string[] }>(
          `Suggest 4-8 topic tags for this story: lowercase, 1-3 words each, concrete (countries, sectors, institutions, events) — no generic tags like "news". ${EDITORIAL_RULES}\n\nTITLE: ${input.title}\n\nSTORY:\n${target.slice(0, 4000)}\n\nRespond as JSON: {"tags": ["...", "..."]}`,
        );
        const tags = (out.tags ?? [])
          .filter((t) => typeof t === 'string')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t && t.length <= 50)
          .slice(0, 8);
        if (tags.length === 0) throw new BadRequestException('The model returned no tags — try again.');
        return { mode: input.mode, result: tags.join(', '), variants: tags };
      }
      case 'translate': {
        const out = await this.ollama.generateJson<{ text: string }>(
          `Translate the following text into English. If it is already English, lightly normalise it instead. Keep markdown/paragraph structure and all facts exactly. Output in English only.\n\nTEXT:\n${target.slice(0, 6000)}\n\nRespond as JSON: {"text": "<translation>"}`,
        );
        return { mode: input.mode, result: this.requireText(out.text) };
      }
      case 'tone': {
        const out = await this.ollama.generateJson<{ text: string }>(
          `Rewrite the following text in a strictly neutral, dispassionate news register: remove loaded adjectives, editorialising and emotional framing; attribute opinions to their holders. Keep every fact and the paragraph structure. ${EDITORIAL_RULES}\n\nTEXT:\n${target.slice(0, 6000)}\n\nRespond as JSON: {"text": "<neutral text>"}`,
        );
        return { mode: input.mode, result: this.requireText(out.text) };
      }
    }
  }

  private requireText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('The model returned an empty result — try again.');
    }
    return value.trim();
  }
}
