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

// Several official government feeds (e.g. state.gov) serve an HTML error
// page to non-browser user agents, so requests must look like a browser.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Government feeds are frequently hand-assembled and ship bare "&" characters
// in URLs/titles, which is invalid XML and kills a strict parser. Escape any
// ampersand that isn't already the start of a valid entity.
const BARE_AMP_RE = /&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g;

@Injectable()
export class RssAdapter {
  private readonly logger = new Logger(RssAdapter.name);
  private readonly parser = new Parser({
    timeout: 15_000,
    customFields: { item: ['media:content', 'media:thumbnail'] },
  });

  async fetch(feedUrl: string): Promise<FetchedItem[]> {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${feedUrl}`);
    const raw = await res.text();
    if (!/<(rss|feed|rdf)/i.test(raw.slice(0, 1000))) {
      // Anti-bot interstitials (captcha pages, "technical difficulties"
      // shells) come back as HTML with a 200 — fail loudly instead of
      // handing HTML to the XML parser.
      throw new Error(`Response from ${feedUrl} is not an RSS/Atom document`);
    }
    const feed = await this.parser.parseString(raw.replace(BARE_AMP_RE, '&amp;'));
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
