// Content for the footer's Company / Legal pages. One honest, maintained
// source of truth — the /[slug] route renders whatever is defined here, so
// the footer never links to a page that doesn't exist.

export interface InfoSection {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface InfoPage {
  slug: string;
  title: string;
  tagline: string;
  sections: InfoSection[];
}

const CONTACT_NOTE =
  'Apolitics is in active development ahead of public launch; the fastest way to reach the team is the contact page.';

export const INFO_PAGES: InfoPage[] = [
  {
    slug: 'about',
    title: 'About Apolitics',
    tagline: 'Apolitically about politics — without bias.',
    sections: [
      {
        paragraphs: [
          'Apolitics is a geopolitical news and intelligence platform covering conflicts, economies, and political risk across 201 countries and territories. The premise is in the name: report what happened and what the data says — not which side to take.',
          'We pair a live editorial feed with a proprietary macro-intelligence layer: a Country Health score built from World Bank and IMF indicators, trade interdependence from UN Comtrade, energy benchmarks from the EIA, and sanctions exposure from OpenSanctions. Every score is explainable — the full component breakdown is stored and shown, never a black box.',
        ],
      },
      {
        heading: 'What makes us different',
        paragraphs: [],
        bullets: [
          'Data before adjectives: claims are grounded in named, dated indicators.',
          'Both sides of every conflict are sourced — official statements from all parties, clearly labelled.',
          'No ads, no engagement algorithms, no third-party trackers.',
          'AI is a drafting tool for our editors, never an unsupervised publisher.',
        ],
      },
    ],
  },
  {
    slug: 'editorial-standards',
    title: 'Editorial Standards',
    tagline: 'How a story gets from source to screen.',
    sections: [
      {
        heading: 'Sourcing tiers',
        paragraphs: [
          'Every source in our pipeline carries an explicit trust class, and that class follows the story into print:',
        ],
        bullets: [
          'Wire services and established international outlets — the baseline news feed.',
          'Official government sources (ministries, heads of state, institutions) — labelled "Official" and treated as statements of a party, not neutral fact.',
          'Local and partisan media — labelled as unverified reports and never published without editorial review.',
        ],
      },
      {
        heading: 'Nothing publishes itself',
        paragraphs: [
          'Ingested stories land in a moderation queue with unpublished status. A human editor reviews, enriches, and approves every story that goes live. Scheduled publication is editor-set; the system only executes the editor’s decision.',
        ],
      },
      {
        heading: 'AI disclosure',
        paragraphs: [
          'Our editors use a locally hosted language model to draft analyses grounded in our own verified data (macro indicators, trade flows, sanctions counts, sourced statements). Drafts are always reviewed, edited, and approved by a human before publication. The model is instructed to preserve facts, attribute claims, and write in a neutral register — and the editor is accountable for the result.',
        ],
      },
      {
        heading: 'Corrections',
        paragraphs: [
          'When we get something wrong, we fix the story and say so. Material corrections are noted in the article. Report an error via the contact page.',
        ],
      },
    ],
  },
  {
    slug: 'press',
    title: 'Press',
    tagline: 'Media inquiries and brand use.',
    sections: [
      {
        paragraphs: [
          'For media inquiries about Apolitics — our methodology, the Country Health index, or our coverage — reach us through the contact page and mark the message "Press".',
          'When citing our data or scores, please attribute "Apolitics" and note the underlying primary sources (World Bank, IMF WEO, UN Comtrade, EIA, OpenSanctions), which retain their own licenses.',
        ],
      },
      {
        heading: 'Brand',
        paragraphs: [
          'The Apolitics mark (the "A-peak") and wordmark may be used unmodified when referring to Apolitics. Don’t use them to imply endorsement.',
        ],
      },
    ],
  },
  {
    slug: 'careers',
    title: 'Careers',
    tagline: 'A small team building unbiased news infrastructure.',
    sections: [
      {
        paragraphs: [
          'There are no open roles right now — Apolitics is pre-launch and the team is intentionally small.',
          'That said, we read every serious message. If data-grounded, bias-free news coverage is a problem you want to work on — particularly data engineering, geopolitics research, or editorial — introduce yourself via the contact page with "Careers" in the subject.',
        ],
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    tagline: 'Talk to the newsroom.',
    sections: [
      {
        paragraphs: [
          'Apolitics is currently in pre-launch development, so contact channels are minimal but real:',
        ],
        bullets: [
          'General & press: message the team via the editors’ workspace if you have an account, or open an issue on our public tracker.',
          'Corrections: include the article link and the specific claim you believe is wrong.',
          'Security reports: describe the issue privately — please don’t post vulnerabilities publicly.',
        ],
      },
      {
        paragraphs: [
          'Public email addresses will be published here at launch. Until then, responses may take a few days.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    tagline: 'The short version: we run no ads and track almost nothing.',
    sections: [
      {
        heading: 'What we collect from readers',
        paragraphs: [],
        bullets: [
          'Aggregate view counts per article (no identifier attached by default).',
          'With your consent only: a random, anonymous session id stored in your browser, used to count unique and returning readers and referring domains. It contains no personal data and is never joined with any identity.',
          'Your theme preference and your consent choice, stored locally in your browser and never transmitted.',
        ],
      },
      {
        heading: 'What we deliberately don’t do',
        paragraphs: [],
        bullets: [
          'No advertising, ad identifiers, or ad networks.',
          'No third-party analytics or tracking scripts of any kind.',
          'No sale or sharing of data with anyone.',
          'No profiling of readers.',
        ],
      },
      {
        heading: 'Registered users',
        paragraphs: [
          'If you create an account (to comment, or as an editor), we store your email, display name, optional avatar, and hashed password. Comments you post are public. You can ask us to delete your account and its data via the contact page.',
        ],
      },
      {
        heading: 'Withdrawing consent',
        paragraphs: [
          'Choosing "Essential only" in the privacy banner (or clearing your browser storage) removes the analytics session id immediately. Aggregate view counts, which contain no identifier, are unaffected.',
        ],
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    tagline: 'Plain-language rules for using Apolitics.',
    sections: [
      {
        heading: 'Content',
        paragraphs: [
          'Our articles and the Country Health index are provided for information, not as legal, financial, or safety advice. Underlying datasets (World Bank, IMF, UN Comtrade, EIA, OpenSanctions) belong to their publishers under their own licenses.',
        ],
      },
      {
        heading: 'Your conduct',
        paragraphs: ['When commenting or registering you agree to:'],
        bullets: [
          'Not post unlawful, harassing, or deliberately false content.',
          'Not attempt to disrupt or gain unauthorised access to the service.',
          'Not scrape the site at abusive rates (public data endpoints are rate-limited).',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: [
          'The service is provided "as is", pre-launch, without warranty. We may change or discontinue features at any time. We moderate comments and may remove content or accounts that break these rules.',
        ],
      },
    ],
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    tagline: 'Strictly speaking, we use browser storage — and very little of it.',
    sections: [
      {
        paragraphs: [
          'Apolitics sets no third-party cookies. Everything below is first-party browser storage, listed exhaustively:',
        ],
        bullets: [
          'Consent choice — remembers whether you accepted analytics. Essential.',
          'Theme — your light/dark preference. Essential.',
          'Session id (analytics) — a random anonymous identifier for unique-reader counts. Only with your consent; removed instantly if you switch to "Essential only".',
          'Auth tokens — kept only for signed-in users (commenters and editors) to stay signed in. Essential for accounts.',
        ],
      },
      {
        paragraphs: [
          'You can change your choice at any time by clearing site data in your browser; the banner will ask again on your next visit.',
        ],
      },
    ],
  },
  {
    slug: 'data-ethics',
    title: 'Data Ethics',
    tagline: 'Where our numbers come from and how we use them.',
    sections: [
      {
        heading: 'Primary data sources',
        paragraphs: [],
        bullets: [
          'World Bank — GDP, population, and 9 macro indicators (actuals).',
          'IMF World Economic Outlook via DBnomics — forward-looking forecasts, always labelled as forecasts with their year.',
          'UN Comtrade — bilateral trade flows.',
          'US EIA — energy benchmarks (Brent, WTI, Henry Hub).',
          'OpenSanctions — aggregate sanctioned-entity counts.',
          'Open-Meteo — weather (no API key, no tracking).',
        ],
      },
      {
        heading: 'Principles',
        paragraphs: [],
        bullets: [
          'Actuals and forecasts are never mixed silently — every figure carries its year and its nature.',
          'Countries with insufficient data coverage are skipped, not scored on guesses.',
          'Scores are explainable: the component breakdown behind every Country Health value is stored and inspectable.',
          'Map geometry follows UN-recognized borders.',
          'AI models run locally on our own hardware; reader data never feeds any model.',
        ],
      },
    ],
  },
  {
    slug: 'compliance',
    title: 'Compliance',
    tagline: 'Licensing, attribution, and takedowns.',
    sections: [
      {
        heading: 'Data licensing',
        paragraphs: [
          'We use public and openly licensed datasets and honor their terms: World Bank (CC BY-4.0), IMF/DBnomics (open access), UN Comtrade (public dissemination terms), US EIA (public domain), OpenSanctions (CC BY-NC for the consolidated dataset), Open-Meteo (CC BY 4.0). Wire and official content is quoted with attribution and linked to the original.',
        ],
      },
      {
        heading: 'Privacy law',
        paragraphs: [
          'Our reader-data practices (see the Privacy Policy) are designed to satisfy GDPR by construction: no profiling, anonymous-only analytics behind opt-in consent, immediate erasure on withdrawal, and no data transfers to third parties.',
        ],
      },
      {
        heading: 'Takedown and disputes',
        paragraphs: [
          'If you believe content on Apolitics infringes your rights, contact us with the article link and the basis of the claim; we review every notice. ' + CONTACT_NOTE,
        ],
      },
    ],
  },
];

export const INFO_PAGE_BY_SLUG = new Map(INFO_PAGES.map((p) => [p.slug, p]));
