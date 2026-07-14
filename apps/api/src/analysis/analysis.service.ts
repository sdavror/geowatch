import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EventImpactReport } from '@geowatch/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { OllamaClient } from './ollama.client';
import { WORLD_BANK_INDICATORS } from '../macro/worldbank.adapter';
import { IMF_WEO_INDICATORS } from '../macro/imf-weo.adapter';
import { matchCountries } from '../ingestion/country-matcher.util';
import { EnergyService } from '../macro/energy.service';

const INDICATOR_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(WORLD_BANK_INDICATORS).map(([code, m]) => [`WB:${code}`, m.name])),
  ...Object.fromEntries(Object.entries(IMF_WEO_INDICATORS).map(([code, m]) => [`IMF:${code}`, m.name])),
};

// An event rarely directly involves more than a few states; capping keeps
// the prompt within what a local 14B model handles reliably.
const MAX_INVOLVED_COUNTRIES = 4;
const MAX_REGIONAL_PEERS = 6;

export interface GeneratedDraft {
  title: string;
  summary: string;
  body: string;
}

/** Everything the prompts know about one country, gathered in one query pass. */
interface CountryContext {
  country: { id: string; name: string; status: string; region: string | null };
  healthScore: { value: unknown } | null;
  indicators: Array<{ indicatorCode: string; value: unknown; period: Date; isForecast: boolean }>;
  sanctions: { entityCount: number } | null;
  riskHistory: { score: unknown } | null;
  recentArticles: Array<{ title: string; category: string | null; publishedAt: Date | null }>;
  officialStatements: Array<{ title: string; publishedAt: Date | null; source: { name: string } | null }>;
  mediaReports: Array<{ title: string; publishedAt: Date | null; source: { name: string } | null }>;
  tradePartners: Array<{ partnerName: string; flow: string; year: number; valueUsd: bigint }>;
}

const fmtDate = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : 'undated');

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaClient,
    private readonly energy: EnergyService,
  ) {}

  async generateCountryDraft(countryId: string): Promise<GeneratedDraft> {
    const ctx = await this.gatherCountryContext(countryId.toUpperCase());
    const prompt = this.buildCountryPrompt(ctx);
    const raw = await this.ollama.generateJson<Record<string, unknown>>(prompt);
    return this.repairDraft(raw);
  }

  async generateEventImpact(eventText: string): Promise<EventImpactReport> {
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
    const involvedIds = matchCountries(eventText, countries).slice(0, MAX_INVOLVED_COUNTRIES);
    if (involvedIds.length === 0) {
      throw new BadRequestException(
        'The event description must name at least one country — the analysis is grounded in per-country data.',
      );
    }

    const [involved, energyBenchmarks] = await Promise.all([
      Promise.all(involvedIds.map((id) => this.gatherCountryContext(id))),
      this.energy.latestBenchmarks(),
    ]);
    const regions = [...new Set(involved.map((c) => c.country.region).filter((r): r is string => !!r))];
    const peers = await this.gatherRegionalPeers(regions, involvedIds);

    const prompt = this.buildEventPrompt(eventText, involved, peers, energyBenchmarks);
    const raw = await this.ollama.generateJson<Record<string, unknown>>(prompt);

    // Built from what was actually non-empty when the prompt was assembled
    // — not asked of the model, so the citation list can't hallucinate a
    // source that wasn't really used.
    const sources = [...new Set([...involved.flatMap((ctx) => this.citationsFor(ctx)), ...(energyBenchmarks.length > 0 ? ['EIA (energy spot prices)'] : []), ...(peers.length > 0 ? ['Apolitics Country Health Index (regional peers)'] : [])])];

    return this.repairEventReport(raw, sources);
  }

  private async gatherCountryContext(id: string): Promise<CountryContext> {
    const country = await this.prisma.country.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, region: true },
    });
    if (!country) throw new NotFoundException(`Country "${id}" not found`);

    const [healthScore, indicators, sanctions, recentArticles, riskHistory, officialStatements, mediaReports, tradeFlows] = await Promise.all([
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
      // Grey-tier local media (Telegram news channels, official:false).
      // Like official statements they're source data, not our editorial
      // output — moderation status is irrelevant to their use as context.
      // Capped to the last 3 days: media noise ages faster than statements.
      this.prisma.article.findMany({
        where: {
          countryId: id,
          source: { official: false, type: 'scraper' },
          publishedAt: { gte: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
        },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { title: true, publishedAt: true, source: { select: { name: true } } },
      }),
      this.prisma.tradeFlow.findMany({
        where: { reporterId: id },
        orderBy: [{ year: 'desc' }, { valueUsd: 'desc' }],
        take: 40, // both flows of the latest stored year (≤15 partners each)
        include: { partner: { select: { name: true } } },
      }),
    ]);

    // Top-5 per flow is plenty for the prompt — trade concentration, not
    // the full partner list, is what spillover reasoning needs.
    const latestTradeYear = tradeFlows[0]?.year;
    const topPerFlow = (flow: string) =>
      tradeFlows.filter((t) => t.year === latestTradeYear && t.flow === flow).slice(0, 5);
    const tradePartners = [...topPerFlow('X'), ...topPerFlow('M')].map((t) => ({
      partnerName: t.partner.name,
      flow: t.flow,
      year: t.year,
      valueUsd: t.valueUsd,
    }));

    return { country, healthScore, indicators, sanctions, recentArticles, riskHistory, officialStatements, mediaReports, tradePartners };
  }

  /**
   * The largest economies of the involved countries' regions — the "who
   * else does this touch" candidates for spillover reasoning. Health score
   * attached where computed.
   */
  private async gatherRegionalPeers(
    regions: string[],
    excludeIds: string[],
  ): Promise<Array<{ id: string; name: string; region: string | null; healthScore: number | null }>> {
    if (regions.length === 0) return [];
    const peers = await this.prisma.country.findMany({
      where: { region: { in: regions }, id: { notIn: excludeIds } },
      orderBy: { gdpUsd: 'desc' },
      take: MAX_REGIONAL_PEERS,
      select: { id: true, name: true, region: true },
    });
    const scores = await this.prisma.countryHealthScore.findMany({
      where: { countryId: { in: peers.map((p) => p.id) }, scoreName: 'country_health' },
      orderBy: { period: 'desc' },
      distinct: ['countryId'],
      select: { countryId: true, value: true },
    });
    const byId = new Map(scores.map((s) => [s.countryId, Number(s.value)]));
    return peers.map((p) => ({ ...p, healthScore: byId.get(p.id) ?? null }));
  }

  // ── Prompt building ────────────────────────────────────────────────

  /**
   * Shared periodization contract for both prompts. Local models blur time
   * horizons badly without this — an early draft presented a 2030 IMF
   * forecast as the current unemployment rate.
   */
  private periodizationRules(): string {
    const today = new Date().toISOString().slice(0, 10);
    return (
      `TODAY is ${today}. Every data point below is dated — respect the dates strictly:\n` +
      `- "actual YYYY" values are measured history for that year, not the present.\n` +
      `- "forecast YYYY" values are IMF projections for that future year. NEVER present a ` +
      `forecast as a current or past fact; always say "forecast for YYYY".\n` +
      `- Headlines and statements carry their publication date; treat anything older than ` +
      `30 days as background, not breaking news.`
    );
  }

  private countryDataLines(ctx: CountryContext): string[] {
    const lines: string[] = [];
    if (ctx.healthScore) {
      lines.push(
        `- Composite "Country Health" score: ${Number(ctx.healthScore.value).toFixed(0)}/100 ` +
          `(percentile rank among all countries on income, growth, inflation, unemployment, debt, ` +
          `FDI, inequality, IMF growth forecast, and sanctions exposure; higher = healthier)`,
      );
    }
    const actuals = ctx.indicators.filter((i) => !i.isForecast);
    const forecasts = ctx.indicators.filter((i) => i.isForecast);
    if (actuals.length > 0) {
      lines.push('- Measured economic indicators (most recent available year each):');
      for (const ind of actuals) {
        const label = INDICATOR_LABELS[ind.indicatorCode] ?? ind.indicatorCode;
        lines.push(`  - ${label}: ${Number(ind.value).toFixed(2)} (actual ${ind.period.getFullYear()})`);
      }
    }
    if (forecasts.length > 0) {
      lines.push('- IMF projections (future years — not current facts):');
      for (const ind of forecasts) {
        const label = INDICATOR_LABELS[ind.indicatorCode] ?? ind.indicatorCode;
        lines.push(`  - ${label}: ${Number(ind.value).toFixed(2)} (forecast ${ind.period.getFullYear()})`);
      }
    }
    if (ctx.sanctions) {
      lines.push(`- ${ctx.sanctions.entityCount} sanctioned entities associated with this country (OpenSanctions aggregate).`);
    }
    if (ctx.riskHistory) {
      lines.push(`- Conflict/stability risk score: ${Number(ctx.riskHistory.score).toFixed(1)}/10, status: ${ctx.country.status}.`);
    }
    if (ctx.tradePartners.length > 0) {
      const year = ctx.tradePartners[0].year;
      const fmtBn = (v: bigint) => `$${(Number(v) / 1e9).toFixed(1)}bn`;
      const exp = ctx.tradePartners.filter((t) => t.flow === 'X');
      const imp = ctx.tradePartners.filter((t) => t.flow === 'M');
      if (exp.length > 0) {
        lines.push(
          `- Top export destinations (actual ${year}, UN Comtrade): ` +
            exp.map((t) => `${t.partnerName} ${fmtBn(t.valueUsd)}`).join(', '),
        );
      }
      if (imp.length > 0) {
        lines.push(
          `- Top import origins (actual ${year}, UN Comtrade): ` +
            imp.map((t) => `${t.partnerName} ${fmtBn(t.valueUsd)}`).join(', '),
        );
      }
    }
    if (ctx.recentArticles.length > 0) {
      lines.push('- Recent published headlines about this country:');
      for (const a of ctx.recentArticles) {
        lines.push(`  - (${fmtDate(a.publishedAt)}) ${a.title}${a.category ? ` [${a.category}]` : ''}`);
      }
    }
    if (ctx.officialStatements.length > 0) {
      lines.push(
        '- Recent official government statements concerning this country ' +
          '(primary-source press releases; attribute clearly, treat as the position of the issuing government, not established fact):',
      );
      for (const s of ctx.officialStatements) {
        lines.push(`  - (${fmtDate(s.publishedAt)}) [${s.source?.name ?? 'Official source'}] ${s.title}`);
      }
    }
    if (ctx.mediaReports.length > 0) {
      lines.push(
        '- Recent local media reports (Telegram news channels, UNVERIFIED — ' +
          'treat strictly as claims by the named outlet, never as established fact; note the outlet\'s origin when weighing it):',
      );
      for (const m of ctx.mediaReports) {
        lines.push(`  - (${fmtDate(m.publishedAt)}) [${m.source?.name ?? 'Media'}] ${m.title}`);
      }
    }
    return lines;
  }

  /** Citation strings for whichever of this country's data sections were actually non-empty. */
  private citationsFor(ctx: CountryContext): string[] {
    const cites: string[] = [];
    if (ctx.healthScore || ctx.riskHistory) cites.push('Apolitics Country Health Index');
    if (ctx.indicators.some((i) => !i.isForecast)) cites.push('World Bank (economic indicators)');
    if (ctx.indicators.some((i) => i.isForecast)) cites.push('IMF World Economic Outlook (forecasts)');
    if (ctx.sanctions) cites.push('OpenSanctions');
    if (ctx.tradePartners.length > 0) cites.push('UN Comtrade (bilateral trade data)');
    if (ctx.recentArticles.length > 0) cites.push('Apolitics published coverage');
    for (const s of ctx.officialStatements) cites.push(`${s.source?.name ?? 'Official source'} (official statement)`);
    for (const m of ctx.mediaReports) cites.push(`${m.source?.name ?? 'Media'} (unverified media report)`);
    return cites;
  }

  private buildCountryPrompt(ctx: CountryContext): string {
    const lines: string[] = [];
    lines.push(
      `You are an analyst for Apolitics, a geopolitical news site whose brand promise is ` +
        `"apolitically about politics, without bias." Write a neutral, data-grounded analytical ` +
        `brief about ${ctx.country.name}, based ONLY on the data below. Do not invent facts not ` +
        `present in this data, and do not take a partisan or moralizing tone.`,
    );
    lines.push('', this.periodizationRules());
    lines.push('', 'DATA:');
    lines.push(...this.countryDataLines(ctx));
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

  private buildEventPrompt(
    eventText: string,
    involved: CountryContext[],
    peers: Array<{ id: string; name: string; region: string | null; healthScore: number | null }>,
    energyBenchmarks: Array<{ name: string; latestPeriod: string; value: number; units: string; change30dPct: number | null }> = [],
  ): string {
    const lines: string[] = [];
    lines.push(
      `You are an analyst for Apolitics, a geopolitical news site whose brand promise is ` +
        `"apolitically about politics, without bias." Assess the reported event below: who it ` +
        `affects and its possible macroeconomic consequences for the region. Ground every claim ` +
        `in the event text or the data sections; do not invent facts. The event is a REPORT, not ` +
        `verified truth — refer to it as "the reported incident", never assert it independently ` +
        `happened. Stay neutral: no partisan or moralizing tone, no cheering for any side. ` +
        `Cite concrete figures from the data (trade values with partner and year, scores, sanction ` +
        `counts) wherever they support a point — "Turkey bought $26.4bn of Russian exports in 2021" ` +
        `is analysis; "trade may be affected" is filler.`,
    );
    lines.push('', this.periodizationRules());
    lines.push('', `REPORTED EVENT (unverified): ${eventText.trim()}`);

    if (energyBenchmarks.length > 0) {
      lines.push('', 'GLOBAL ENERGY BENCHMARKS (market context for energy-related consequences):');
      for (const b of energyBenchmarks) {
        const change = b.change30dPct === null ? '' : ` (${b.change30dPct > 0 ? '+' : ''}${b.change30dPct}% over 30 days)`;
        lines.push(`  - ${b.name}: ${b.value} ${b.units} as of ${b.latestPeriod}${change}`);
      }
    }

    for (const ctx of involved) {
      lines.push('', `DATA — ${ctx.country.name}${ctx.country.region ? ` (${ctx.country.region})` : ''}:`);
      lines.push(...this.countryDataLines(ctx));
    }

    if (peers.length > 0) {
      lines.push(
        '',
        'OTHER MAJOR ECONOMIES IN THE AFFECTED REGION(S) — spillover candidates ' +
          '(consider trade, shipping, energy and insurance channels; mention only those the event plausibly touches):',
      );
      for (const p of peers) {
        const score = p.healthScore != null ? `Country Health ${p.healthScore.toFixed(0)}/100` : 'no health score computed';
        lines.push(`  - ${p.name}${p.region ? ` (${p.region})` : ''} — ${score}`);
      }
    }

    lines.push(
      '',
      'Respond with ONLY a JSON object with EXACTLY these keys and value types, no others:',
      '{',
      '  "title": "concise headline for the assessment",',
      '  "summary": "2-3 sentence executive summary",',
      '  "what_happened": "one paragraph restating the reported incident with appropriate attribution",',
      '  "affected": [{"actor": "country/sector/market", "why": "one sentence on the exposure channel"}],',
      '  "impact_short_term": ["consequence plausible within 0-3 months", "..."],',
      '  "impact_medium_term": ["consequence plausible within 3-12 months", "..."],',
      '  "watchpoints": ["specific indicator or decision to monitor", "..."]',
      '}',
      'Each array MUST contain 2 to 5 items. Every string is plain text — no markdown, no nested objects beyond the "affected" entries.',
    );
    return lines.join('\n');
  }

  // ── Output repair / shaping ────────────────────────────────────────

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

  /** Coerce whatever the model returned into the report shape, then compose the plain-text body. */
  private repairEventReport(raw: Record<string, unknown>, sources: string[]): EventImpactReport {
    const toStringArray = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map((x) => String(typeof x === 'object' && x !== null ? JSON.stringify(x) : x)).filter(Boolean);
      if (typeof v === 'string' && v.trim()) return [v.trim()];
      return [];
    };
    const affectedRaw = Array.isArray(raw.affected) ? raw.affected : [];
    const affected = affectedRaw
      .map((entry): { actor: string; why: string } => {
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>;
          return { actor: String(e.actor ?? ''), why: String(e.why ?? '') };
        }
        return { actor: String(entry ?? ''), why: '' };
      })
      .filter((e) => e.actor);

    const report: Omit<EventImpactReport, 'body'> = {
      title: String(raw.title ?? ''),
      summary: String(raw.summary ?? ''),
      whatHappened: String(raw.what_happened ?? raw.whatHappened ?? ''),
      affected,
      impactShortTerm: toStringArray(raw.impact_short_term ?? raw.impactShortTerm),
      impactMediumTerm: toStringArray(raw.impact_medium_term ?? raw.impactMediumTerm),
      watchpoints: toStringArray(raw.watchpoints),
      sources,
    };
    return { ...report, body: this.composeEventBody(report) };
  }

  /** Plain-text sections — the article page renders body as pre-wrap text, not markdown. */
  private composeEventBody(r: Omit<EventImpactReport, 'body'>): string {
    const bullet = (items: string[]) => items.map((i) => `• ${i}`).join('\n');
    const sections: string[] = [];
    if (r.whatHappened) sections.push(r.whatHappened);
    if (r.affected.length > 0) {
      sections.push('WHO IS AFFECTED\n\n' + r.affected.map((a) => `• ${a.actor} — ${a.why}`).join('\n'));
    }
    if (r.impactShortTerm.length > 0) {
      sections.push('SHORT-TERM IMPACT (0–3 MONTHS)\n\n' + bullet(r.impactShortTerm));
    }
    if (r.impactMediumTerm.length > 0) {
      sections.push('MEDIUM-TERM OUTLOOK (3–12 MONTHS)\n\n' + bullet(r.impactMediumTerm));
    }
    if (r.watchpoints.length > 0) {
      sections.push('WHAT TO WATCH\n\n' + bullet(r.watchpoints));
    }
    if (r.sources.length > 0) {
      sections.push('SOURCES\n\n' + bullet(r.sources));
    }
    return sections.join('\n\n');
  }
}
