import { STATUS_COLOR, STATUS_LABEL } from '@geowatch/shared-types';
import type { CountryStatus } from '@geowatch/shared-types';
import type { MapColorMode } from './WorldMap';

const STATUS_ORDER: CountryStatus[] = ['conflict', 'crisis', 'unstable', 'stable'];

const LEGEND_BY_MODE: Record<MapColorMode, { title: string; items: Array<{ color: string; label: string }> }> = {
  stability: {
    title: 'Status legend',
    items: STATUS_ORDER.map((s) => ({ color: STATUS_COLOR[s], label: STATUS_LABEL[s] })),
  },
  health: {
    title: 'Country Health legend',
    items: [
      { color: '#3ecf8e', label: 'Good (≥60)' },
      { color: '#e8b84a', label: 'Moderate (40–59)' },
      { color: '#e84545', label: 'Weak (<40)' },
    ],
  },
  conflict: {
    title: 'Conflict intensity legend',
    items: [
      { color: '#e84545', label: 'Heavy (50+ events/12m)' },
      { color: '#e8b84a', label: 'Some activity' },
      { color: '#3a4150', label: 'No recorded events' },
    ],
  },
};

export function MapLegend({ mode = 'stability' }: { mode?: MapColorMode }) {
  const legend = LEGEND_BY_MODE[mode];
  return (
    <div className="absolute left-3 top-3 z-10 rounded-2xl border border-border/10 bg-bg-2/60 p-3 shadow-lg backdrop-blur-xl">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-text-tertiary">
        {legend.title}
      </div>
      <div className="flex flex-col gap-1.5">
        {legend.items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
