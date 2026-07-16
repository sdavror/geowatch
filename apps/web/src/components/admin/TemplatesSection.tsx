'use client';

// Story templates: a pre-structured starting point the editor opens
// pre-filled. Static by design — the newsroom's formats are stable and a
// template with real editorial guidance beats a user-managed blank one.

export interface StoryTemplate {
  key: string;
  icon: string;
  name: string;
  description: string;
  category: 'military' | 'economic' | 'political' | 'humanitarian';
  title: string;
  summary: string;
  body: string;
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    key: 'news-brief',
    icon: '📰',
    name: 'News brief',
    description: 'Short factual update: what happened, who confirmed it, why it matters.',
    category: 'political',
    title: '[Country]: [what happened in one line]',
    summary: 'One-sentence summary of the event and its immediate significance.',
    body: 'WHAT HAPPENED\n\n[2-3 sentences: the fact, the date, the place. Attribute every claim to its source.]\n\nWHO CONFIRMED IT\n\n[Official statements vs media reports — keep the evidence classes separate.]\n\nWHY IT MATTERS\n\n[1-2 sentences of context grounded in data: trend, prior events, indicators.]',
  },
  {
    key: 'country-analysis',
    icon: '📊',
    name: 'Country analysis',
    description: 'Data-grounded macro overview — pair with “Generate analysis” and the research brief.',
    category: 'economic',
    title: '[Country]: state of play — [angle]',
    summary: 'What the latest indicators say about [country], and what to watch next.',
    body: 'CURRENT POSITION\n\n[Country Health score, GDP growth, inflation, unemployment — actual values with years. Use the research brief for exact figures.]\n\nRECENT DEVELOPMENTS\n\n[Dated headlines and official statements from the last weeks.]\n\nOUTLOOK\n\n[Forecast indicators (IMF WEO), labelled as forecasts with their years.]\n\nWATCHPOINTS\n\n[3-4 concrete signals that would change this assessment.]',
  },
  {
    key: 'event-impact',
    icon: '⚡',
    name: 'Event impact report',
    description: 'Structured impact assessment — pair with the “Analyze event” tool.',
    category: 'military',
    title: '[Event]: assessing the impact',
    summary: 'What happened, who is affected, and the likely 0-3 and 3-12 month consequences.',
    body: 'WHAT HAPPENED\n\n[The reported event, with attribution and confidence level.]\n\nAFFECTED ACTORS AND CHANNELS\n\n[Countries and the channels through which the impact travels: trade, energy, sanctions, security.]\n\nSHORT-TERM IMPACT (0-3 MONTHS)\n\n[...]\n\nMEDIUM-TERM OUTLOOK (3-12 MONTHS)\n\n[...]\n\nWATCHPOINTS\n\n[Concrete indicators to monitor.]',
  },
  {
    key: 'humanitarian-update',
    icon: '🕊',
    name: 'Humanitarian update',
    description: 'Situation report focused on civilian impact — displacement, aid, infrastructure.',
    category: 'humanitarian',
    title: '[Region]: humanitarian situation update',
    summary: 'Civilian impact of [situation]: displacement, access, aid response.',
    body: 'SITUATION\n\n[Scale and nature of the humanitarian impact, with sources and dates.]\n\nDISPLACEMENT AND ACCESS\n\n[Population movements, humanitarian access constraints.]\n\nRESPONSE\n\n[Government/international response so far — official statements.]\n\nNEEDS AND GAPS\n\n[What is missing; forward risks.]',
  },
];

interface TemplatesSectionProps {
  onUseTemplate: (t: StoryTemplate) => void;
}

export function TemplatesSection({ onUseTemplate }: TemplatesSectionProps) {
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-h1 text-text-primary">Templates</h1>
      <p className="mb-4 text-caption text-text-tertiary">
        Structured starting points for the newsroom&apos;s recurring formats — each opens the editor
        pre-filled and works with the AI tools and the research brief.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STORY_TEMPLATES.map((t) => (
          <div key={t.key} className="flex flex-col rounded-2xl border border-border/10 bg-bg-2 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[18px]">{t.icon}</span>
              <h2 className="text-h3 text-text-primary">{t.name}</h2>
            </div>
            <p className="mb-3 flex-1 text-caption text-text-tertiary">{t.description}</p>
            <div>
              <button
                onClick={() => onUseTemplate(t)}
                className="rounded-full bg-brand-bg px-4 py-1.5 text-caption font-medium text-brand-text hover:opacity-90"
              >
                Use template
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
