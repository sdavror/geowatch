'use client';

import type { Country } from '@geowatch/shared-types';

function fmtGdp(usd: number): string {
  if (usd >= 1_000_000_000_000) return `$${(usd / 1_000_000_000_000).toFixed(1)}T`;
  return `$${Math.round(usd / 1_000_000_000)}B`;
}

/**
 * "Markets"-style widget powered by real data we already hold — the
 * world's largest economies by GDP (World Bank, refreshed daily). Honest
 * stand-in for a stock ticker without a new external feed.
 */
export function MarketsWidget({ countries }: { countries: Country[] }) {
  const top = [...countries]
    .filter((c) => c.gdpUsd)
    .sort((a, b) => (b.gdpUsd ?? 0) - (a.gdpUsd ?? 0))
    .slice(0, 6);

  if (top.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Largest economies
        </h3>
        <span className="text-[10px] text-text-tertiary">GDP · World Bank</span>
      </div>
      <div className="flex flex-col divide-y divide-border/10">
        {top.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
            <span className="w-4 text-[12px] font-semibold tabular-nums text-text-tertiary">{i + 1}</span>
            <span className="text-[15px]">{c.flagEmoji}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{c.name}</span>
            <span className="text-[13px] font-semibold tabular-nums text-brand-text">
              {fmtGdp(c.gdpUsd as number)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
