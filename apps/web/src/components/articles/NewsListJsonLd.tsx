import type { Article } from '@geowatch/shared-types';

/**
 * Emits schema.org structured data for the homepage feed: an ItemList of
 * NewsArticle entries. This is what feeds Google News / Top Stories
 * eligibility — far more impactful for SEO than the visual column layout.
 * Rendered as a JSON-LD script tag; Google executes and reads it.
 */
export function NewsListJsonLd({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: articles.slice(0, 30).map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'NewsArticle',
        headline: a.title,
        ...(a.publishedAt ? { datePublished: a.publishedAt } : {}),
        ...(a.aiSummary ? { description: a.aiSummary } : {}),
        ...(a.url ? { url: a.url, mainEntityOfPage: a.url } : {}),
        ...(a.country?.name
          ? { contentLocation: { '@type': 'Place', name: a.country.name } }
          : {}),
        articleSection: a.category ?? undefined,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
