import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';

export interface FetchedItem {
  title: string;
  url: string;
  body: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

// Pulls the first <img> src out of an RSS item's HTML content/description —
// many feeds embed the lead image there instead of using <enclosure>.
const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/i;

// media:content / media:thumbnail are a common RSS extension for the lead
// image (Media RSS namespace) that rss-parser doesn't expose by default —
// only enclosure and inline <img> tags are, hence the explicit customFields.
interface MediaField {
  $?: { url?: string };
}

@Injectable()
export class RssAdapter {
  private readonly logger = new Logger(RssAdapter.name);
  private readonly parser = new Parser({
    timeout: 15_000,
    customFields: { item: ['media:content', 'media:thumbnail'] },
  });

  async fetch(feedUrl: string): Promise<FetchedItem[]> {
    const feed = await this.parser.parseURL(feedUrl);
    const items: FetchedItem[] = [];

    for (const item of feed.items ?? []) {
      if (!item.title || !item.link) continue;

      // customFields narrows rss-parser's Item type to just the fields we
      // declared, dropping standard-but-untyped keys like 'content:encoded'
      // — cast once to a loose dynamic shape for all of these lookups.
      const dyn = item as unknown as {
        content?: string;
        'content:encoded'?: string;
        enclosure?: { url?: string };
        'media:content'?: MediaField;
        'media:thumbnail'?: MediaField;
      };
      const rawContent = dyn['content:encoded'] ?? dyn.content ?? '';
      const imageUrl =
        dyn.enclosure?.url ??
        dyn['media:content']?.$?.url ??
        dyn['media:thumbnail']?.$?.url ??
        rawContent.match(IMG_SRC_RE)?.[1] ??
        null;

      items.push({
        title: item.title.trim(),
        url: item.link.trim(),
        body: item.contentSnippet?.trim() || null,
        imageUrl,
        publishedAt: item.isoDate
          ? new Date(item.isoDate)
          : item.pubDate
            ? new Date(item.pubDate)
            : new Date(),
      });
    }
    this.logger.log(`Fetched ${items.length} items from ${feedUrl}`);
    return items;
  }
}
