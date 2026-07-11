'use client';

import { useEffect, useState } from 'react';

// Open-Meteo — free, no API key, no attribution key required. We fetch a
// few world capitals so the widget is meaningful without asking the user
// for geolocation permission on first load.
const CITIES = [
  { name: 'Kyiv', lat: 50.45, lon: 30.52 },
  { name: 'Washington', lat: 38.9, lon: -77.04 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Beijing', lat: 39.9, lon: 116.4 },
];

interface Row {
  name: string;
  tempC: number | null;
  code: number | null;
}

// Minimal WMO weather-code → emoji + label map (grouped).
function describe(code: number | null): { icon: string; label: string } {
  if (code === null) return { icon: '·', label: '' };
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code <= 3) return { icon: '⛅', label: 'Cloudy' };
  if (code <= 48) return { icon: '🌫️', label: 'Fog' };
  if (code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code <= 77) return { icon: '❄️', label: 'Snow' };
  if (code <= 82) return { icon: '🌦️', label: 'Showers' };
  if (code <= 99) return { icon: '⛈️', label: 'Storm' };
  return { icon: '·', label: '' };
}

export function WeatherWidget() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          CITIES.map(async (c) => {
            const res = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code`,
            );
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            return {
              name: c.name,
              tempC: Math.round(data.current?.temperature_2m ?? NaN),
              code: data.current?.weather_code ?? null,
            } as Row;
          }),
        );
        if (!cancelled) setRows(results);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fail quietly — a weather strip must never break the page.
  if (failed) return null;

  return (
    <section className="rounded-2xl border border-border/10 bg-bg-2 p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        Weather · world capitals
      </h3>
      <div className="flex flex-col divide-y divide-border/10">
        {(rows ?? CITIES.map((c) => ({ name: c.name, tempC: null, code: null }))).map((r) => {
          const w = describe(r.code);
          return (
            <div key={r.name} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-[16px]">{w.icon}</span>
              <span className="flex-1 text-[13px] text-text-primary">{r.name}</span>
              <span className="text-[12px] text-text-tertiary">{w.label}</span>
              <span className="w-10 text-right text-[13px] font-semibold tabular-nums text-text-primary">
                {r.tempC === null || Number.isNaN(r.tempC) ? '—' : `${r.tempC}°`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
