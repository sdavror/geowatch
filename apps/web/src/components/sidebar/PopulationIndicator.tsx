'use client';

import { usePopulationHistory } from '@/hooks/useCountries';

function formatPopulation(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/**
 * Current population plus its change over the last 10 years of World
 * Bank data. Growth renders green, decline red — a shrinking population
 * is itself a slow-burning instability signal.
 */
export function PopulationIndicator({ countryId }: { countryId: string }) {
  const { history, isLoading } = usePopulationHistory(countryId);

  if (isLoading) {
    return <div className="h-3 w-24 animate-pulse rounded bg-bg-3" />;
  }
  if (history.length === 0) {
    return (
      <p className="text-[10px] text-text-tertiary">Population data unavailable</p>
    );
  }

  const latest = history[history.length - 1];
  // The comparison point: exactly 10 years before the latest data point,
  // or the oldest point we have if the series is shorter.
  const baseline =
    history.find((p) => p.year === latest.year - 10) ?? history[0];
  const span = latest.year - baseline.year;
  const changePct =
    baseline.population > 0
      ? ((latest.population - baseline.population) / baseline.population) * 100
      : null;
  const growing = changePct !== null && changePct >= 0;

  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-text-tertiary">Population</span>
      <span className="text-text-secondary">
        {formatPopulation(latest.population)}
        {changePct !== null && span > 0 && (
          <span className={growing ? 'text-status-stable' : 'text-status-conflict'}>
            {' '}
            {growing ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}% / {span}y
          </span>
        )}
      </span>
    </div>
  );
}
