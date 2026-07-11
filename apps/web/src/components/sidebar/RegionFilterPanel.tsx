'use client';

import { STATUS_COLOR, STATUS_LABEL } from '@geowatch/shared-types';
import type { Country, CountryStatus } from '@geowatch/shared-types';

const STATUS_ORDER: CountryStatus[] = ['conflict', 'crisis', 'unstable', 'stable'];

interface RegionFilterPanelProps {
  countries: Country[];
  regionFilter: string | null;
  onSelectRegion: (region: string | null) => void;
  statusFilter: CountryStatus | null;
  onSelectStatus: (status: CountryStatus | null) => void;
}

export function RegionFilterPanel({
  countries,
  regionFilter,
  onSelectRegion,
  statusFilter,
  onSelectStatus,
}: RegionFilterPanelProps) {
  // Derive the region list from whatever data we actually have, rather than
  // hardcoding names — keeps this in sync if regions change server-side.
  const regions = Array.from(
    new Set(countries.map((c) => c.region).filter((r): r is string => !!r)),
  ).sort();

  const statusCounts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = countries.filter((c) => c.status === s).length;
    return acc;
  }, {});

  return (
    <aside className="flex w-28 flex-shrink-0 flex-col gap-5 overflow-y-auto border-r border-border/10 bg-bg-2 px-2.5 py-3">
      <div>
        <div className="mb-1.5 px-1 text-[10px] tracking-wide text-text-tertiary">REGIONS</div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onSelectRegion(null)}
            className={`rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
              regionFilter === null
                ? 'bg-bg-3 text-text-primary'
                : 'text-text-tertiary hover:bg-bg-3/50 hover:text-text-secondary'
            }`}
          >
            World
          </button>
          {regions.map((region) => (
            <button
              key={region}
              onClick={() => onSelectRegion(region === regionFilter ? null : region)}
              className={`truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                regionFilter === region
                  ? 'bg-bg-3 text-text-primary'
                  : 'text-text-tertiary hover:bg-bg-3/50 hover:text-text-secondary'
              }`}
              title={region}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 px-1 text-[10px] tracking-wide text-text-tertiary">STATUS</div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onSelectStatus(null)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${
              statusFilter === null ? 'bg-bg-3' : 'hover:bg-bg-3/50'
            }`}
          >
            <span className="flex-1 truncate text-[11px] text-text-secondary">All</span>
            <span className="text-[11px] text-text-tertiary">{countries.length}</span>
          </button>
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              onClick={() => onSelectStatus(status === statusFilter ? null : status)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                statusFilter === status ? 'bg-bg-3' : 'hover:bg-bg-3/50'
              }`}
            >
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
              />
              <span className="flex-1 truncate text-[11px] text-text-secondary">
                {STATUS_LABEL[status]}
              </span>
              <span className="text-[11px] text-text-tertiary">{statusCounts[status] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
