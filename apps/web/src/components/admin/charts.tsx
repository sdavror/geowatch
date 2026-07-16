'use client';

// Tiny hand-rolled SVG charts — deliberately no charting dependency: the
// admin needs one line-area and one bar shape, and adding a library for
// that would bloat the bundle and the Docker build.

interface SeriesPoint {
  label: string; // e.g. "2026-07-16"
  value: number;
}

/** Filled line ("area") chart with day labels on the x-axis edges. */
export function AreaChart({ data, color = '#2563EB', height = 160 }: { data: SeriesPoint[]; color?: string; height?: number }) {
  const width = 640;
  const pad = { top: 12, right: 8, bottom: 20, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (data.length === 0) {
    return <p className="py-8 text-center text-caption text-text-tertiary">No data for this period yet.</p>;
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const x = (i: number) => pad.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => ({ y: y(max * f), v: Math.round(max * f) }));
  const fmtDay = (label: string) =>
    new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Trend chart">
      {gridLines.map((g) => (
        <g key={g.v}>
          <line x1={pad.left} x2={width - pad.right} y1={g.y} y2={g.y} stroke="currentColor" strokeOpacity={0.08} />
          <text x={pad.left - 6} y={g.y + 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.45}>
            {g.v}
          </text>
        </g>
      ))}
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={d.label} cx={x(i)} cy={y(d.value)} r={data.length > 45 ? 0 : 2.4} fill={color}>
          <title>{`${fmtDay(d.label)}: ${d.value}`}</title>
        </circle>
      ))}
      <text x={pad.left} y={height - 6} fontSize={9} fill="currentColor" fillOpacity={0.45}>
        {fmtDay(data[0].label)}
      </text>
      <text x={width - pad.right} y={height - 6} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.45}>
        {fmtDay(data[data.length - 1].label)}
      </text>
    </svg>
  );
}

/** Horizontal bar list with value + share labels — top stories, referrers. */
export function BarList({
  rows,
  color = '#2563EB',
  valueSuffix = '',
}: {
  rows: Array<{ label: string; value: number; hint?: string }>;
  color?: string;
  valueSuffix?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-caption text-text-tertiary">No data for this period yet.</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-0.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-caption text-text-secondary">{r.label}</span>
            <span className="whitespace-nowrap text-caption font-medium tabular-nums text-text-primary">
              {r.value.toLocaleString('en-US')}
              {valueSuffix}
              {r.hint && <span className="ml-1.5 font-normal text-text-tertiary">{r.hint}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max((r.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Period switcher shared by the three analytics pages. */
export function DaysPicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`rounded-full px-3 py-1 text-caption transition-colors ${
            value === d ? 'bg-brand-bg font-medium text-brand-text' : 'bg-bg-3 text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
