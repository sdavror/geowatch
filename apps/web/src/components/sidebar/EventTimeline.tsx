import type { GeopoliticalEvent } from '@geowatch/shared-types';

const CATEGORY_STYLE: Record<string, string> = {
  military: 'bg-status-conflict/15 text-status-conflict',
  economic: 'bg-status-crisis/15 text-status-crisis',
  political: 'bg-status-unstable/15 text-status-unstable',
  humanitarian: 'bg-accent-purple/15 text-accent-purple',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function EventTimeline({ events }: { events: GeopoliticalEvent[] }) {
  if (events.length === 0) {
    return <p className="text-xs text-text-tertiary">No recorded events yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border border-border/10 bg-bg-3 p-2.5 transition-colors hover:bg-bg-4"
        >
          <div className="mb-1 text-[10px] text-text-tertiary">
            {formatDate(event.startedAt)}
          </div>
          <div className="text-xs font-medium leading-relaxed text-text-primary">
            {event.title}
          </div>
          <span
            className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${
              CATEGORY_STYLE[event.category] ?? 'bg-bg-4 text-text-secondary'
            }`}
          >
            {event.category}
          </span>
        </div>
      ))}
    </div>
  );
}
