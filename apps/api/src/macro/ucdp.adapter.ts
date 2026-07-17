import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE_URL = 'https://ucdpapi.pcr.uu.se/api/gedevents';
const PAGE_SIZE = 1000;
// Hard ceiling well under the 5000 req/day quota — a runaway pagination
// loop must never eat the whole daily budget.
const MAX_REQUESTS_PER_REFRESH = 200;

export interface UcdpEvent {
  country: string; // UCDP country name (Gleditsch-Ward naming)
  dateStart: string; // ISO date
  deaths: number; // "best" fatality estimate
  typeOfViolence: 1 | 2 | 3; // 1 state-based, 2 non-state, 3 one-sided
}

interface GedResponse {
  TotalCount: number;
  TotalPages: number;
  NextPageUrl: string;
  Result: Array<{
    country: string;
    date_start: string;
    best: number;
    type_of_violence: number;
  }>;
}

/**
 * UCDP Georeferenced Event Dataset (GED) API client. Two dataset families:
 * the final annual release (e.g. "26.1", covers through last year) and
 * monthly candidate releases ("26.0.5" = May of 2026, provisional). A full
 * refresh reads the trailing window from the final set plus every published
 * candidate month of the current year.
 */
@Injectable()
export class UcdpAdapter {
  private readonly logger = new Logger(UcdpAdapter.name);
  private requestsThisRefresh = 0;

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return !!this.config.get('UCDP_API_TOKEN');
  }

  private get finalVersion(): string {
    return this.config.get('UCDP_GED_VERSION', '26.1');
  }

  private async fetchPage(url: string): Promise<GedResponse | null> {
    if (this.requestsThisRefresh >= MAX_REQUESTS_PER_REFRESH) {
      this.logger.warn(`Request cap (${MAX_REQUESTS_PER_REFRESH}) hit — stopping pagination`);
      return null;
    }
    this.requestsThisRefresh++;
    const res = await fetch(url, {
      headers: { 'x-ucdp-access-token': this.config.get('UCDP_API_TOKEN', '') },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 400 || res.status === 404) return null; // version not published
    if (!res.ok) throw new Error(`UCDP ${res.status} for ${url.replace(/token[^&]*/i, '')}`);
    return (await res.json()) as GedResponse;
  }

  private async fetchVersion(version: string, startDate?: string): Promise<UcdpEvent[] | null> {
    const events: UcdpEvent[] = [];
    let url = `${BASE_URL}/${version}?pagesize=${PAGE_SIZE}${startDate ? `&StartDate=${startDate}` : ''}`;
    let first = true;
    while (url) {
      const page = await this.fetchPage(url);
      if (!page) return first ? null : events; // 400 on first page = unpublished version
      first = false;
      for (const e of page.Result) {
        events.push({
          country: e.country,
          dateStart: e.date_start.slice(0, 10),
          deaths: Number(e.best) || 0,
          typeOfViolence: (e.type_of_violence as 1 | 2 | 3) ?? 1,
        });
      }
      url = page.NextPageUrl || '';
      // Gentle pacing — UCDP asks for restraint, and we're far from limits.
      if (url) await new Promise((r) => setTimeout(r, 300));
    }
    return events;
  }

  /**
   * All events from `startDate` (final dataset) plus every published
   * candidate month of the current year. Candidate months are provisional
   * data — good enough for trend monitoring, replaced by the final release
   * next year.
   */
  async fetchWindow(startDate: string): Promise<{ events: UcdpEvent[]; sources: string[] }> {
    this.requestsThisRefresh = 0;
    const sources: string[] = [];

    const finalEvents = (await this.fetchVersion(this.finalVersion, startDate)) ?? [];
    if (finalEvents.length > 0) sources.push(this.finalVersion);
    this.logger.log(`GED ${this.finalVersion}: ${finalEvents.length} events since ${startDate}`);

    const all = [...finalEvents];
    const yearPrefix = this.finalVersion.split('.')[0]; // "26" → candidates 26.0.X
    for (let m = 1; m <= 12; m++) {
      const version = `${yearPrefix}.0.${m}`;
      const candidate = await this.fetchVersion(version);
      if (candidate === null) break; // first unpublished month ends the run
      all.push(...candidate);
      sources.push(version);
      this.logger.log(`GED candidate ${version}: ${candidate.length} events`);
    }

    return { events: all, sources };
  }
}
