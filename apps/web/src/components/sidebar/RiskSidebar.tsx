'use client';

import dynamic from 'next/dynamic';
import type { Country } from '@geowatch/shared-types';
import { STATUS_COLOR } from '@geowatch/shared-types';

const MiniMap = dynamic(() => import('@/components/map/MiniMap').then((m) => m.MiniMap), {
  ssr: false,
});

interface RiskSidebarProps {
  countries: Country[];
  onSelectCountry?: (id: string) => void;
  onOpenFullMap?: () => void;
}

export function RiskSidebar({ countries, onSelectCountry, onOpenFullMap }: RiskSidebarProps) {
  const topRisk = [...countries].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6);

  return (
    <aside className="w-64 flex-shrink-0 border-l border-border/10 bg-bg-2 p-4">
      <div className="mb-4 overflow-hidden rounded-lg border border-border/10 bg-bg">
        <div className="h-28">
          <MiniMap countries={countries} onSelectCountry={onSelectCountry} />
        </div>
        <button
          onClick={onOpenFullMap}
          className="group flex w-full items-center justify-between px-3 py-2 text-[12px] text-text-tertiary transition-colors hover:text-brand-text"
        >
          <span>World risk map</span>
          <span className="text-brand-text group-hover:underline">View ›</span>
        </button>
      </div>

      <div className="text-[11px] font-medium tracking-wide text-text-tertiary">TOP RISK INDEX</div>
      <div className="mt-2 flex flex-col gap-2">
        {topRisk.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectCountry?.(c.id)}
            className="group flex items-center justify-between text-[12px]"
          >
            <span className="text-text-primary transition-colors group-hover:text-brand-text">
              {c.flagEmoji} {c.name}
            </span>
            <span className="font-medium" style={{ color: STATUS_COLOR[c.status] }}>
              {c.riskScore.toFixed(1)}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
