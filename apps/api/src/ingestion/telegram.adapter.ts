import { Injectable, Logger } from '@nestjs/common';
import { FetchedItem } from './rss.adapter';

// Public Telegram channels expose a server-rendered web preview at
// https://t.me/s/<channel> — no credentials, no MTProto session, no bot
// (bots can't read channels they don't administer anyway). Good enough
// for official government channels, where the text of the statement is
// the value. Channels with the preview disabled 302-redirect to the app
// landing page; that surfaces here as "no posts found".
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const POST_ID_RE = /data-post="([^"]+)"/;
const TIME_RE = /<time[^>]*datetime="([^"]+)"/;
const TEXT_RE = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/;
const IMAGE_RE = /tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/;

// Telegram posts have no separate headline — the first sentence serves as
// one, matching how the moderation queue and analysis prompts use titles.
const TITLE_MAX_CHARS = 140;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function htmlToText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class TelegramAdapter {
  private readonly logger = new Logger(TelegramAdapter.name);

  /** True if the source URL is a Telegram channel this adapter can fetch. */
  static isTelegramUrl(url: string): boolean {
    return /^https:\/\/t\.me\//.test(url);
  }

  /** Channel slug from either t.me/s/<name> or t.me/<name>. */
  private channelSlug(url: string): string {
    return url.replace(/^https:\/\/t\.me\/(s\/)?/, '').replace(/\/.*$/, '');
  }

  async fetch(sourceUrl: string): Promise<FetchedItem[]> {
    const channel = this.channelSlug(sourceUrl);
    const res = await fetch(`https://t.me/s/${channel}`, {
      headers: { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`t.me responded ${res.status} for @${channel}`);
    const html = await res.text();

    const items: FetchedItem[] = [];
    // Each message sits in its own tgme_widget_message_wrap block; splitting
    // on the class name isolates one post's markup per chunk.
    for (const chunk of html.split('tgme_widget_message_wrap').slice(1)) {
      const post = chunk.match(POST_ID_RE)?.[1]; // "<channel>/<numeric id>"
      const datetime = chunk.match(TIME_RE)?.[1];
      const rawText = chunk.match(TEXT_RE)?.[1];
      if (!post || !rawText) continue; // service messages (pins, photos without text)

      const text = htmlToText(rawText);
      if (!text) continue;
      const firstLine = text.split('\n')[0];
      const title = firstLine.length > TITLE_MAX_CHARS ? `${firstLine.slice(0, TITLE_MAX_CHARS - 1)}…` : firstLine;

      items.push({
        title,
        url: `https://t.me/${post}`,
        body: text,
        imageUrl: chunk.match(IMAGE_RE)?.[1] ?? null,
        publishedAt: datetime ? new Date(datetime) : new Date(),
      });
    }

    if (items.length === 0) {
      // A 200 with zero parseable posts usually means the channel's web
      // preview is disabled (t.me serves the app-landing shell instead).
      throw new Error(`No posts found for @${channel} — is the channel's web preview enabled?`);
    }
    this.logger.log(`Fetched ${items.length} posts from t.me/@${channel}`);
    return items;
  }
}
