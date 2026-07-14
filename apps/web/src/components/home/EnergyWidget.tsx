'use client';

import { useEnergyBenchmarks } from '@/hooks/useMacroScores';

// One glyph per benchmark — a lightweight visual anchor, same role the
// flag emoji plays in MarketsWidget/CountryHealthWidget's rows.
const SERIES_ICON: Record<string, string> = {
  RBRTE: '🛢️',
  RWTC: '🛢️',
  RNGWHHD: '🔥',
};

/**
 * World energy benchmarks (Brent/WTI/Henry Hub spot, EIA) — the same
 * market context the event-impact analysis cites for energy-adjacent
 * events. Renders nothing until the daily EIA refresh has loaded data.
 */
export function EnergyWidget() {
  const { benchmarks, isLoading } = useEnergyBenchmarks();

  if (!isLoading && benchmarks.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Energy
        </h3>
        <span className="text-[10px] text-text-tertiary">Spot · EIA</span>
      </div>
      <div className="flex flex-col divide-y divide-border/10">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <div className="h-4 w-24 animate-pulse rounded bg-bg-3" />
              </div>
            ))
          : benchmarks.map((b) => {
              const up = b.change30dPct !== null && b.change30dPct >= 0;
              return (
                <div key={b.series} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="text-[15px]">{SERIES_ICON[b.series] ?? '⚡'}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{b.name}</span>
                  <span className="text-right text-[13px] font-semibold tabular-nums text-brand-text">
                    ${b.value.toFixed(2)}
                    {b.change30dPct !== null && (
                      <span className={`ml-1.5 text-[11px] font-normal ${up ? 'text-status-stable' : 'text-status-conflict'}`}>
                        {up ? '▲' : '▼'} {Math.abs(b.change30dPct).toFixed(1)}%
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
      </div>
    </section>
  );
}
