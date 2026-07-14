'use client';

import { useTradePartners } from '@/hooks/useMacroScores';

function formatValue(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  return `$${(usd / 1_000_000).toFixed(0)}M`;
}

/**
 * A country's top trade partners (UN Comtrade, latest reported year) —
 * "who this economy actually depends on", the same interdependence signal
 * the event-impact analysis reasons over. Silently renders nothing for the
 * ~34 countries that don't report to Comtrade, matching how GdpIndicator
 * and PopulationIndicator handle missing data.
 */
export function TradePartnersWidget({ countryId }: { countryId: string }) {
  const { trade, isLoading } = useTradePartners(countryId);

  if (isLoading) {
    return (
      <div className="mb-4 rounded-lg border border-border/10 bg-bg-3 p-2.5">
        <div className="h-3 w-28 animate-pulse rounded bg-bg-4" />
      </div>
    );
  }
  if (!trade || (trade.exports.length === 0 && trade.imports.length === 0)) {
    return null;
  }

  const renderList = (rows: typeof trade.exports) => (
    <div className="flex flex-col gap-1">
      {rows.slice(0, 3).map((p) => (
        <div key={p.partnerId} className="flex items-center justify-between text-[11px]">
          <span className="flex min-w-0 items-center gap-1 text-text-secondary">
            <span>{p.flagEmoji ?? '🌐'}</span>
            <span className="truncate">{p.partnerName}</span>
          </span>
          <span className="tabular-nums text-text-primary">{formatValue(p.valueUsd)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border border-border/10 bg-bg-3 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-text-tertiary">Top trade partners</span>
        <span className="text-text-tertiary">{trade.year} · Comtrade</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-tertiary">Exports to</div>
          {trade.exports.length > 0 ? renderList(trade.exports) : (
            <p className="text-[11px] text-text-tertiary">—</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-tertiary">Imports from</div>
          {trade.imports.length > 0 ? renderList(trade.imports) : (
            <p className="text-[11px] text-text-tertiary">—</p>
          )}
        </div>
      </div>
    </div>
  );
}
