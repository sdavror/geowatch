'use client';

const TOPICS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🔄',
    title: 'The editorial workflow',
    body:
      'Every story moves through Idea → Draft → In review → Ready to publish → Published (or Scheduled / Archived). ' +
      'Ingested wire and Telegram stories land in “In review” automatically — nothing goes live without an editor. ' +
      'Move stories on the Kanban board, from the status pages, or with the Status field in the editor.',
  },
  {
    icon: '🕓',
    title: 'Scheduling',
    body:
      'Set a story to “Scheduled” and pick a date & time in the editor. The system publishes it automatically ' +
      'within a minute of the chosen moment. Scheduled stories appear on the Calendar and in the Scheduled page.',
  },
  {
    icon: '✨',
    title: 'AI & research tools (in the editor)',
    body:
      '“Generate analysis” drafts a country analysis from live macro data on the local LLM (no cloud, ~30-120 s). ' +
      '“Analyze event” turns a described event into a structured impact report. ' +
      '“Load research” gives raw verified numbers and primary-source links with no AI in the loop. ' +
      'Everything is a draft for your judgement — nothing publishes itself.',
  },
  {
    icon: '📈',
    title: 'Analytics',
    body:
      'Views counts article reads; Audience counts unique anonymous sessions (no tracking cookies); ' +
      'Traffic sources shows referring domains — capture started July 2026, older views count as Direct.',
  },
  {
    icon: '📡',
    title: 'Sources & data refresh',
    body:
      'Ingestion runs every 15 minutes across the RSS/official/Telegram sources (manage them in Sources). ' +
      'Macro data refreshes daily, trade weekly, energy daily — or trigger any of them manually from the ' +
      'Dashboard’s System & data block.',
  },
  {
    icon: '👥',
    title: 'Roles',
    body:
      'Viewers can read and comment on the public site. Editors get this workspace. ' +
      'The owner (superadmin) additionally manages users and sources. Promote accounts in Users.',
  },
];

export function HelpSection() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-h1 text-text-primary">Help & support</h1>
      <p className="mb-5 text-caption text-text-tertiary">
        How the Apolitics editorial workspace fits together.
      </p>

      <div className="flex flex-col gap-3">
        {TOPICS.map((t) => (
          <section key={t.title} className="rounded-2xl border border-border/10 bg-bg-2 p-4">
            <h2 className="mb-1.5 flex items-center gap-2 text-h3 text-text-primary">
              <span>{t.icon}</span> {t.title}
            </h2>
            <p className="text-body2 leading-relaxed text-text-secondary">{t.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-5 text-caption text-text-tertiary">
        Something broken or missing? Message the owner in Messages, or check the API health on the
        Dashboard under System &amp; data.
      </p>
    </div>
  );
}
