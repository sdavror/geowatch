'use client';

import type { MacroScoreEntry } from '@geowatch/shared-types';

// Same green/red convention already used for population YoY change
// elsewhere (WorldMap's hover popup) — kept consistent rather than
// inventing a third color pair for "good vs bad" on this site.
function scoreColor(value: number): string {
  if (value >= 60) return '#3ecf8e';
  if (value >= 40) return '#e8b84a';
  return '#e84545';
}

/**
 * "Country Health" leaderboard — our own composite index (World Bank + IMF
 * forecasts + sanctions pressure, percentile-normalized), not a re-display
 * of someone else's number. See GET /macro/scores.
 */
export function CountryHealthWidget({ scores }: { scores: MacroScoreEntry[] }) {
  const top = [...scores].sort((a, b) => b.value - a.value).slice(0, 6);
  if (top.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Country health
        </h3>
        <span className="text-[10px] text-text-tertiary">Apolitics index</span>
      </div>
      <div className="flex flex-col divide-y divide-border/10">
        {top.map((s, i) => (
          <div key={s.countryId} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
            <span className="w-4 text-[12px] font-semibold tabular-nums text-text-tertiary">{i + 1}</span>
            <span className="text-[15px]">{s.flagEmoji}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{s.countryName}</span>
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: scoreColor(s.value) }}
            >
              {s.value.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
