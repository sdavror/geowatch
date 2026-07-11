import { STATUS_COLOR, STATUS_LABEL } from '@geowatch/shared-types';
import type { CountryStatus } from '@geowatch/shared-types';

const ORDER: CountryStatus[] = ['conflict', 'crisis', 'unstable', 'stable'];

export function MapLegend() {
  return (
    <div className="absolute left-3 top-3 z-10 rounded-2xl border border-border/10 bg-bg-2/60 p-3 shadow-lg backdrop-blur-xl">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-text-tertiary">
        Status Legend
      </div>
      <div className="flex flex-col gap-1.5">
        {ORDER.map((status) => (
          <div key={status} className="flex items-center gap-2 text-xs text-text-secondary">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[status] }}
            />
            {STATUS_LABEL[status]}
          </div>
        ))}
      </div>
    </div>
  );
}
