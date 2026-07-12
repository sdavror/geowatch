import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClient } from './ollama.client';
import { WORLD_BANK_INDICATORS } from '../macro/worldbank.adapter';
import { IMF_WEO_INDICATORS } from '../macro/imf-weo.adapter';

const INDICATOR_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(WORLD_BANK_INDICATORS).map(([code, m]) => [`WB:${code}`, m.name])),
  ...Object.fromEntries(Object.entries(IMF_WEO_INDICATORS).map(([code, m]) => [`IMF:${code}`, m.name])),
};

export interface GeneratedDraft {
  title: string;
  summary: string;
  body: string;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaClient,
  ) {}

  async generateCountryDraft(countryId: string): Promise<GeneratedDraft> {
    const id = countryId.toUpperCase();
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException(`Country "${id}" not found`);

    const [healthScore, indicators, sanctions, recentArticles, riskHistory, officialStatements] = await Promise.all([
      this.prisma.countryHealthScore.findFirst({
        where: { countryId: id, scoreName: 'country_health' },
        orderBy: { period: 'desc' },
      }),
      this.prisma.economicIndicator.findMany({
        where: { countryId: id },
        orderBy: { period: 'desc' },
        distinct: ['indicatorCode'],
      }),
      this.prisma.sanctionRecord.findFirst({
        where: { countryId: id, program: 'opensanctions:all' },
        orderBy: { asOf: 'desc' },
      }),
      this.prisma.article.findMany({
        where: { countryId: id, published: true },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { title: true, category: true, publishedAt: true },
      }),
      this.prisma.riskScoreHistory.findFirst({
        where: { countryId: id },
        orderBy: { computedAt: 'desc' },
      }),
      // Official government statements are source data, not our editorial
      // output — include them regardless of moderation status (ingested
      // statements sit unpublished in the queue but are still real context).
      this.prisma.article.findMany({
        where: { countryId: id, source: { official: true } },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { title: true, publishedAt: true, source: { select: { name: true } } },
      }),
    ]);

    const prompt = this.buildPrompt({
      country,
      healthScore,
      indicators,
      sanctions,
      recentArticles,
      riskHistory,
      officialStatements,
    });
    const raw = await this.ollama.generateJson<Record<string, unknown>>(prompt);
    return this.repairDraft(raw);
  }

  private buildPrompt(data: {
    country: { id: string; name: string; status: string };
    healthScore: { value: unknown; components: unknown } | null;
    indicators: Array<{ indicatorCode: string; value: unknown; period: Date; isForecast: boolean }>;
    sanctions: { entityCount: number } | null;
    recentArticles: Array<{ title: string; category: string | null; publishedAt: Date | null }>;
    riskHistory: { score: unknown } | null;
    officialStatements: Array<{ title: string; publishedAt: Date | null; source: { name: string } | null }>;
  }): string {
    const lines: string[] = [];
    lines.push(
      `You are an analyst for Apolitics, a geopolitical news site whose brand promise is ` +
        `"apolitically about politics, without bias." Write a neutral, data-grounded analytical ` +
        `brief about ${data.country.name}, based ONLY on the data below. Do not invent facts not ` +
        `present in this data, and do not take a partisan or moralizing tone.`,
    );
    lines.push('', 'DATA:');

    if (data.healthScore) {
      lines.push(
        `- Composite "Country Health" score: ${Number(data.healthScore.value).toFixed(0)}/100 ` +
          `(percentile rank among all countries on income, growth, inflation, unemployment, debt, ` +
          `FDI, inequality, IMF growth forecast, and sanctions exposure; higher = healthier)`,
      );
    }
    if (data.indicators.length > 0) {
      lines.push('- Latest economic indicators:');
      for (const ind of data.indicators) {
        const label = INDICATOR_LABELS[ind.indicatorCode] ?? ind.indicatorCode;
        const year = ind.period.getFullYear();
        const forecastTag = ind.isForecast ? ' (forecast)' : '';
        lines.push(`  - ${label}: ${Number(ind.value).toFixed(2)} (${year}${forecastTag})`);
      }
    }
    if (data.sanctions) {
      lines.push(`- ${data.sanctions.entityCount} sanctioned entities associated with this country (OpenSanctions aggregate).`);
    }
    if (data.riskHistory) {
      lines.push(`- Conflict/stability risk score: ${Number(data.riskHistory.score).toFixed(1)}/10, status: ${data.country.status}.`);
    }
    if (data.recentArticles.length > 0) {
      lines.push('- Recent published headlines about this country:');
      for (const a of data.recentArticles) {
        lines.push(`  - ${a.title}${a.category ? ` [${a.category}]` : ''}`);
      }
    }
    if (data.officialStatements.length > 0) {
      lines.push(
        '- Recent official government statements concerning this country ' +
          '(primary-source press releases; attribute clearly, treat as the position of the issuing government, not established fact):',
      );
      for (const s of data.officialStatements) {
        const attribution = s.source?.name ?? 'Official source';
        lines.push(`  - [${attribution}] ${s.title}`);
      }
    }

    lines.push(
      '',
      'Respond with ONLY a JSON object with EXACTLY three keys — "title", "summary", "body" — ' +
        'and no other keys. "body" MUST be a single JSON string value containing all paragraphs ' +
        'joined by a literal "\\n\\n" (do not split paragraphs into separate keys or additional ' +
        'JSON fields). Example shape: {"title": "...", "summary": "...", "body": ' +
        '"Paragraph one.\\n\\nParagraph two.\\n\\nParagraph three."}',
    );
    return lines.join('\n');
  }

  /**
   * Defensive repair for a real failure mode observed with local models in
   * JSON mode: instead of one "body" string with paragraph breaks, the
   * model sometimes emits each extra paragraph as its own bogus top-level
   * key (with the paragraph text AS the key name, empty string as value).
   * Recover by folding any unexpected keys' names back into the body.
   */
  private repairDraft(raw: Record<string, unknown>): GeneratedDraft {
    const title = String(raw.title ?? '');
    const summary = String(raw.summary ?? '');
    const extraParagraphs = Object.keys(raw).filter((k) => !['title', 'summary', 'body'].includes(k));
    const body = [String(raw.body ?? ''), ...extraParagraphs].filter(Boolean).join('\n\n');
    return { title, summary, body };
  }
}
