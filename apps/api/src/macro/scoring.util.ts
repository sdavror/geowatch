// Percentile-normalized composite scoring — the methodology (v1):
// 1. Take each country's latest value per indicator.
// 2. Normalize to a 0..100 percentile among all countries that have that
//    indicator (higherIsBetter=false inverts it, e.g. lower inflation wins).
// 3. Composite = weighted sum of percentiles. Weights are the product's IP.
// 4. Components are kept alongside the score so a client sees the
//    breakdown, not a black box.
// Methodology is versioned (COUNTRY_HEALTH_METHODOLOGY) so a future v2 can
// run in parallel with v1 for comparison rather than overwriting history.

export const COUNTRY_HEALTH_METHODOLOGY = 'v1';

export interface WeightedComponent {
  code: string;
  weight: number;
  higherIsBetter: boolean;
}

// (indicator code, weight, higherIsBetter)
export const COUNTRY_HEALTH_COMPONENTS: WeightedComponent[] = [
  { code: 'WB:NY.GNP.PCAP.PP.CD', weight: 0.2, higherIsBetter: true }, // purchasing power
  { code: 'WB:NY.GDP.MKTP.KD.ZG', weight: 0.15, higherIsBetter: true }, // GDP growth
  { code: 'WB:FP.CPI.TOTL.ZG', weight: 0.15, higherIsBetter: false }, // inflation
  { code: 'WB:SL.UEM.TOTL.ZS', weight: 0.1, higherIsBetter: false }, // unemployment
  { code: 'WB:GC.DOD.TOTL.GD.ZS', weight: 0.1, higherIsBetter: false }, // government debt
  { code: 'WB:BX.KLT.DINV.WD.GD.ZS', weight: 0.1, higherIsBetter: true }, // FDI
  { code: 'WB:SI.POV.GINI', weight: 0.05, higherIsBetter: false }, // inequality
  { code: 'IMF:NGDP_RPCH', weight: 0.15, higherIsBetter: true }, // forward-looking growth forecast
  // sanctions pressure is added as its own component below, from SanctionRecord
];
export const SANCTIONS_WEIGHT = 0.1;
// Below this fraction of total component weight covered, a country has too
// little data to score meaningfully — skip it rather than publish a
// misleading number built mostly out of missing-data gaps.
const MIN_WEIGHT_COVERAGE = 0.5;

export function percentileRank(values: Map<string, number>, higherIsBetter: boolean): Map<string, number> {
  const result = new Map<string, number>();
  if (values.size === 0) return result;
  const sorted = [...values.values()].sort((a, b) => a - b);
  const n = sorted.length;

  for (const [key, v] of values) {
    let countLessOrEqual = 0;
    for (const x of sorted) if (x <= v) countLessOrEqual++;
    const rank = (countLessOrEqual / n) * 100;
    result.set(key, Math.round((higherIsBetter ? rank : 100 - rank) * 100) / 100);
  }
  return result;
}

export interface CountryHealthResult {
  countryId: string;
  value: number;
  components: Record<string, number>;
}

export function computeCountryHealth(
  latestByIndicator: Map<string, Map<string, number>>, // indicatorCode -> (countryId -> value)
  sanctionCounts: Map<string, number>, // countryId -> entity count
): CountryHealthResult[] {
  const percentiles = new Map<string, Map<string, number>>();
  for (const { code, higherIsBetter } of COUNTRY_HEALTH_COMPONENTS) {
    percentiles.set(code, percentileRank(latestByIndicator.get(code) ?? new Map(), higherIsBetter));
  }
  const sanctionsPercentile = percentileRank(sanctionCounts, false);

  const allCountries = new Set<string>();
  for (const p of percentiles.values()) for (const id of p.keys()) allCountries.add(id);
  for (const id of sanctionsPercentile.keys()) allCountries.add(id);

  const totalPossibleWeight =
    COUNTRY_HEALTH_COMPONENTS.reduce((sum, c) => sum + c.weight, 0) + SANCTIONS_WEIGHT;

  const results: CountryHealthResult[] = [];
  for (const countryId of allCountries) {
    let weightCovered = 0;
    let weightedSum = 0;
    const components: Record<string, number> = {};

    for (const { code, weight } of COUNTRY_HEALTH_COMPONENTS) {
      const pct = percentiles.get(code)?.get(countryId);
      if (pct === undefined) continue;
      weightedSum += weight * pct;
      weightCovered += weight;
      components[code] = pct;
    }
    const sanctionsPct = sanctionsPercentile.get(countryId);
    if (sanctionsPct !== undefined) {
      weightedSum += SANCTIONS_WEIGHT * sanctionsPct;
      weightCovered += SANCTIONS_WEIGHT;
      components['sanctions'] = sanctionsPct;
    }

    if (weightCovered / totalPossibleWeight < MIN_WEIGHT_COVERAGE) continue;
    results.push({
      countryId,
      value: Math.round((weightedSum / weightCovered) * 100) / 100,
      components,
    });
  }
  return results;
}
