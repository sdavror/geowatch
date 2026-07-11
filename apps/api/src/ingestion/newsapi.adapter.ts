import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FetchedItem } from './rss.adapter';

interface NewsApiArticle {
  title: string | null;
  url: string | null;
  description: string | null;
  urlToImage: string | null;
  publishedAt: string | null;
}

/**
 * NewsAPI.org adapter — entirely optional. No key configured (NEWSAPI_KEY
 * unset) is the expected out-of-the-box state; this adapter no-ops rather
 * than erroring, so ingestion runs fine on RSS alone until a key is added.
 */
@Injectable()
export class NewsApiAdapter {
  private readonly logger = new Logger(NewsApiAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!this.config.get<string>('NEWSAPI_KEY');
  }

  async fetchTopHeadlines(): Promise<FetchedItem[]> {
    const key = this.config.get<string>('NEWSAPI_KEY');
    if (!key) return [];

    const url = `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=50&apiKey=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`NewsAPI responded ${res.status}`);
    }
    const data = (await res.json()) as { articles?: NewsApiArticle[] };

    const items: FetchedItem[] = [];
    for (const a of data.articles ?? []) {
      if (!a.title || !a.url) continue;
      items.push({
        title: a.title.trim(),
        url: a.url.trim(),
        body: a.description?.trim() || null,
        imageUrl: a.urlToImage ?? null,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
      });
    }
    this.logger.log(`Fetched ${items.length} items from NewsAPI`);
    return items;
  }
}
