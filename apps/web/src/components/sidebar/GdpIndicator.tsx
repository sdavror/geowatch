// World GDP ÷ number of IMF-tracked countries (2025 estimate): $117.17T / 194.
// Used as the comparison baseline so the indicator reflects "average country
// on Earth", not just the average within our own 20-country seed sample
// (which would be skewed upward by including the US, China, etc).
const WORLD_AVG_GDP_USD = 604_000_000_000;

function formatGdp(usd: number): string {
  if (usd >= 1_000_000_000_000) return `$${(usd / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(usd / 1_000_000_000).toFixed(0)}B`;
}

export function GdpIndicator({ gdpUsd }: { gdpUsd: number | null }) {
  if (gdpUsd === null) {
    return <p className="text-[11px] text-text-tertiary">GDP data unavailable</p>;
  }

  const ratio = gdpUsd / WORLD_AVG_GDP_USD;
  // Log scale: a country at 100x the world average and one at 1/100th
  // should sit near opposite ends of the bar, not have the bar maxed out
  // for anything above 2x — GDP varies by orders of magnitude between
  // countries, so a linear scale would make all but the largest economies
  // look identical.
  const pct = Math.max(2, Math.min(100, 50 + Math.log10(ratio) * 25));
  const aboveAverage = ratio >= 1;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">GDP vs world avg</span>
        <span className={aboveAverage ? 'text-status-stable' : 'text-text-secondary'}>
          {formatGdp(gdpUsd)} · {ratio >= 1 ? `${ratio.toFixed(1)}×` : `${ratio.toFixed(2)}×`}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-bg-3">
        {/* Midpoint marker shows where "world average" sits on the scale */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-border/20" />
        <div
          className={`h-full rounded-full ${aboveAverage ? 'bg-status-stable' : 'bg-text-tertiary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
