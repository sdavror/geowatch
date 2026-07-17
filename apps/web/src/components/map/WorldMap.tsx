'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { Country, MacroScoreEntry, ConflictSummaryEntry } from '@geowatch/shared-types';
import { STATUS_COLOR } from '@geowatch/shared-types';
import { NUMERIC_TO_ALPHA2 } from '@/lib/isoNumericMap';

export type MapColorMode = 'stability' | 'health' | 'conflict';

interface WorldMapProps {
  countries: Country[];
  selectedCountryId: string | null;
  onSelectCountry: (id: string) => void;
  macroScores?: MacroScoreEntry[];
  conflictSummary?: ConflictSummaryEntry[];
  colorMode?: MapColorMode;
}

// We render our OWN country layer from the visionscarto world-atlas data
// instead of using a basemap like demotiles. This is deliberate: the
// visionscarto dataset places Crimea inside Ukraine at the geometry level
// (UN-recognised borders), so Ukraine renders as one continuous territory
// with no overlay, no manual polygon, and no seams — unlike demotiles
// (raw Natural Earth, de-facto borders) which splits Crimea off.
const GEO_URL =
  'https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/110m.json';

// Property key we copy the topojson numeric id into, so MapLibre `match`
// / filter expressions (which read feature.properties, not feature.id)
// can key on it.
const ISO_N3 = 'iso_n3';

interface CountryFeature {
  type: 'Feature';
  id?: string | number;
  geometry: unknown;
  properties: Record<string, unknown>;
}

// ── Antimeridian handling ─────────────────────────────────────────────
// Features that cross the antimeridian (Russia, Fiji) have rings whose
// longitudes jump from +180 to -180 mid-ring. Rendered naively, that jump
// draws a fill band across the whole map. We "unwrap" each ring so it's
// continuous — letting longitudes exceed ±180 — and let MapLibre render
// the overflow on the adjacent world copy (renderWorldCopies: true). A
// dynamic minZoom keeps a single world filling the viewport, so those
// copies never actually show as duplicated continents.
//
// (An earlier version clipped the rings to ±180 to run without world
// copies, but Sutherland–Hodgman clipping produces sliver triangles on
// concave polygons like Russia — the artifacts this replaces.)
function unwrapRing(ring: number[][]): void {
  for (let i = 1; i < ring.length; i++) {
    const prevLon = ring[i - 1][0];
    let lon = ring[i][0];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    ring[i] = [lon, ring[i][1]];
  }
}

function unwrapAntimeridian(geometry: { type: string; coordinates: unknown }): void {
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates as number[][][]) unwrapRing(ring);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates as number[][][][]) {
      for (const ring of polygon) unwrapRing(ring);
    }
  }
}

// Compact GDP label — "$178B" / "$2.0T".
function formatGdpShort(usd: number): string {
  if (usd >= 1_000_000_000_000) return `$${(usd / 1_000_000_000_000).toFixed(1)}T`;
  return `$${Math.round(usd / 1_000_000_000)}B`;
}

// Compact population label — "36.7M" / "1.43B".
function formatPopulationShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Population row for the hover popup: value plus an up/down arrow with the
// change vs the previous year (green growth / red decline).
function populationPopupHtml(country: Country): string {
  if (country.population === null) return '';
  let arrow = '';
  // typeof check (not just !== null): a stale SWR cache from an older API
  // build may lack the field entirely.
  if (typeof country.populationYoyPct === 'number') {
    const up = country.populationYoyPct >= 0;
    const color = up ? '#3ecf8e' : '#e84545';
    arrow =
      ` <span style="color:${color};">${up ? '▲' : '▼'} ` +
      `${Math.abs(country.populationYoyPct).toFixed(1)}%</span>`;
  }
  return (
    `<div style="font:12px var(--font-inter),system-ui;color:rgb(var(--color-text-secondary));">` +
    `${formatPopulationShort(country.population)}${arrow}</div>`
  );
}

// Same green/amber/red convention as the population arrow above — kept
// consistent rather than inventing a new color scale for this second score.
function macroScorePopupHtml(score: MacroScoreEntry | undefined): string {
  if (!score) return '';
  const color = score.value >= 60 ? '#3ecf8e' : score.value >= 40 ? '#e8b84a' : '#e84545';
  return (
    `<div style="font:12px var(--font-inter),system-ui;color:rgb(var(--color-text-secondary));">` +
    `Country health <span style="color:${color};font-weight:600;">${score.value.toFixed(0)}</span></div>`
  );
}

// Minimal MapLibre style: a transparent background and an empty GeoJSON
// source we populate once the world data loads. The background is left
// transparent on purpose — the "globe in space" radial gradient (ocean)
// is painted underneath by the wrapping div using the --color-map-gradient-*
// CSS variables, since MapLibre's background layer only supports flat
// colours/patterns, not CSS gradients.
function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      world: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#000000', 'background-opacity': 0 } },
    ],
  };
}

// Untracked land (Antarctica, Somaliland, N. Cyprus — features with no ISO
// code we curate) needs a theme-aware neutral: a near-black silhouette on
// the dark navy ocean, a soft gray on the pale light-theme ocean. A single
// fixed colour can't do both — pure black looks like a hole punched in the
// light map. MapLibre fills can't read CSS vars, so we pick per theme.
const UNTRACKED_LAND_DARK = '#0a0c10';
const UNTRACKED_LAND_LIGHT = '#c4ccd6';

function isLightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light');
}

// Same green/amber/red convention used by the hover popup's Country Health
// line and by STATUS_COLOR — kept consistent across every map layer rather
// than inventing a new palette per mode.
function healthColor(value: number): string {
  return value >= 60 ? '#3ecf8e' : value >= 40 ? '#e8b84a' : '#e84545';
}

// Trailing-12m summary line shown only when the conflict layer is active —
// on other layers this number would be a non-sequitur next to GDP/health.
function conflictPopupHtml(summary: ConflictSummaryEntry | undefined): string {
  if (!summary || summary.events === 0) {
    return (
      `<div style="font:12px var(--font-inter),system-ui;color:rgb(var(--color-text-secondary));">` +
      `No recorded conflict events (12m)</div>`
    );
  }
  return (
    `<div style="font:12px var(--font-inter),system-ui;color:rgb(var(--color-text-secondary));">` +
    `${summary.events.toLocaleString('en-US')} events · ${summary.deaths.toLocaleString('en-US')} deaths (12m)</div>`
  );
}

// Trailing-12m event counts span orders of magnitude (0 for most countries,
// thousands for an active war) — three buckets read as "none / some /
// heavy" rather than a washed-out linear gradient dominated by outliers.
function conflictColor(events: number): string {
  return events >= 50 ? '#e84545' : events > 0 ? '#e8b84a' : '#3a4150';
}

// Builds the fill-color match expression for the given layer: each tracked
// country's numeric ISO code → a colour from that layer's data; untracked
// land (or a country with no data for this layer) → theme-aware neutral.
function buildFillColor(
  countries: Country[],
  mode: MapColorMode,
  macroScores?: MacroScoreEntry[],
  conflictSummary?: ConflictSummaryEntry[],
): maplibregl.ExpressionSpecification {
  const untracked = isLightTheme() ? UNTRACKED_LAND_LIGHT : UNTRACKED_LAND_DARK;
  const alpha2ToNumeric = new Map<string, string>();
  for (const [num, a2] of Object.entries(NUMERIC_TO_ALPHA2)) alpha2ToNumeric.set(a2, num);

  const healthById = new Map((macroScores ?? []).map((s) => [s.countryId, s.value]));
  const conflictById = new Map((conflictSummary ?? []).map((s) => [s.countryId, s.events]));

  const stops: string[] = [];
  for (const c of countries) {
    const num = alpha2ToNumeric.get(c.id);
    if (!num) continue;

    let color: string | undefined;
    if (mode === 'stability') {
      color = STATUS_COLOR[c.status];
    } else if (mode === 'health') {
      const v = healthById.get(c.id);
      color = v !== undefined ? healthColor(v) : undefined;
    } else {
      const events = conflictById.get(c.id) ?? 0;
      color = conflictColor(events);
    }
    if (color) stops.push(num, color);
  }
  if (stops.length === 0) {
    return ['literal', untracked] as unknown as maplibregl.ExpressionSpecification;
  }
  return [
    'match',
    ['get', ISO_N3],
    ...stops,
    untracked,
  ] as unknown as maplibregl.ExpressionSpecification;
}

// Numeric ISO codes of countries currently in `conflict` — for the glow filter.
function conflictNumerics(countries: Country[]): string[] {
  const alpha2ToNumeric = new Map<string, string>();
  for (const [num, a2] of Object.entries(NUMERIC_TO_ALPHA2)) alpha2ToNumeric.set(a2, num);
  return countries
    .filter((c) => c.status === 'conflict')
    .map((c) => alpha2ToNumeric.get(c.id))
    .filter((n): n is string => Boolean(n));
}

export function WorldMap({
  countries,
  selectedCountryId,
  onSelectCountry,
  macroScores,
  conflictSummary,
  colorMode = 'stability',
}: WorldMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<typeof maplibregl.Map> | null>(null);
  const loadedRef = useRef(false);
  const dataReadyRef = useRef(false);
  const popupRef = useRef<InstanceType<typeof maplibregl.Popup> | null>(null);
  const pulseFrameRef = useRef<number | null>(null);
  const hoveredIsoRef = useRef<string | null>(null);
  const countriesRef = useRef(countries);
  const onSelectRef = useRef(onSelectCountry);
  const macroScoresRef = useRef(macroScores);
  const conflictSummaryRef = useRef(conflictSummary);
  const colorModeRef = useRef(colorMode);
  countriesRef.current = countries;
  onSelectRef.current = onSelectCountry;
  macroScoresRef.current = macroScores;
  conflictSummaryRef.current = conflictSummary;
  colorModeRef.current = colorMode;

  // --- Init map once. ------------------------------------------------------
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: buildBaseStyle(),
      center: [20, 30],
      zoom: 1.4,
      maxZoom: 8,
      attributionControl: false,
      // World copies render antimeridian-crossing polygons (Russia, Fiji)
      // correctly across the seam. lockToOneWorld() below then pins minZoom
      // so a single world always fills the viewport — the copies stay
      // off-screen, so no duplicated continents.
      renderWorldCopies: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Pin minZoom to the zoom at which one world exactly fills the viewport
    // width, so the user can never zoom out far enough to see a second copy.
    // Recomputed on resize. worldPx = 512 * 2^zoom (MapLibre's 512 tiles).
    const lockToOneWorld = () => {
      const w = map.getContainer().clientWidth || 1;
      const fillZoom = Math.log2(w / 512);
      map.setMinZoom(fillZoom);
      if (map.getZoom() < fillZoom) map.setZoom(fillZoom);
    };

    map.on('load', () => {
      loadedRef.current = true;
      lockToOneWorld();
      map.on('resize', lockToOneWorld);

      // Untracked-land fill (drawn first, under the choropleth match — the
      // match itself already handles both, so this single fill layer covers
      // everything; tracked countries get their status colour, the rest the
      // neutral fallback).
      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color': buildFillColor(
            countriesRef.current,
            colorModeRef.current,
            macroScoresRef.current,
            conflictSummaryRef.current,
          ),
          'fill-opacity': 0.92,
        },
      });

      // Thin border on every country for definition.
      map.addLayer({
        id: 'countries-border',
        type: 'line',
        source: 'world',
        paint: { 'line-color': '#343b48', 'line-width': 0.5 },
      });

      // Subtle hover brightening — the country under the cursor lifts,
      // Apple-style. Driven by a filter swap on mousemove; the opacity
      // transition makes it fade in/out instead of snapping.
      map.addLayer({
        id: 'countries-hover',
        type: 'fill',
        source: 'world',
        filter: ['==', ['get', ISO_N3], '___none___'],
        paint: {
          'fill-color': '#ffffff',
          'fill-opacity': 0.08,
        },
      });
      // Fade the hover fill in/out instead of snapping. Transitions aren't
      // part of the addLayer paint typing, so set it separately.
      map.setPaintProperty('countries-hover', 'fill-opacity-transition', {
        duration: 150,
      } as never);

      // Neon conflict glow: wide soft halo + thin bright core.
      const glow = [
        { id: 'conflict-glow-outer', color: '#ff3b3b', width: 12, opacity: 0.25, blur: 4 },
        { id: 'conflict-glow-mid', color: '#ff3b3b', width: 6, opacity: 0.45, blur: 2 },
        { id: 'conflict-glow-core', color: '#ffffff', width: 1.5, opacity: 0.9, blur: 0 },
      ];
      const cn = conflictNumerics(countriesRef.current);
      const conflictFilter =
        cn.length > 0
          ? (['in', ['get', ISO_N3], ['literal', cn]] as unknown as maplibregl.FilterSpecification)
          : (['==', ['get', ISO_N3], '___none___'] as unknown as maplibregl.FilterSpecification);
      for (const g of glow) {
        map.addLayer({
          id: g.id,
          type: 'line',
          source: 'world',
          filter: conflictFilter,
          paint: {
            'line-color': g.color,
            'line-width': g.width,
            'line-opacity': g.opacity,
            ...(g.blur ? { 'line-blur': g.blur } : {}),
          },
        });
      }

      // Selected country: soft white halo + thin crisp core — reads like
      // a focus ring rather than a hard cartographic border.
      map.addLayer({
        id: 'selected-halo',
        type: 'line',
        source: 'world',
        filter: ['==', ['get', ISO_N3], '___none___'],
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.25, 'line-blur': 6 },
      });
      map.addLayer({
        id: 'selected-outline',
        type: 'line',
        source: 'world',
        filter: ['==', ['get', ISO_N3], '___none___'],
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 },
      });

      // Gentle breathing pulse on the conflict glow (~4s cycle). Restrained
      // amplitude on purpose — it should read as "alive", not as blinking.
      const pulseStart = performance.now();
      const pulse = (now: number) => {
        const k = (Math.sin(((now - pulseStart) / 4000) * Math.PI * 2) + 1) / 2;
        if (map.getLayer('conflict-glow-outer')) {
          map.setPaintProperty('conflict-glow-outer', 'line-opacity', 0.15 + 0.2 * k);
        }
        if (map.getLayer('conflict-glow-mid')) {
          map.setPaintProperty('conflict-glow-mid', 'line-opacity', 0.3 + 0.25 * k);
        }
        pulseFrameRef.current = requestAnimationFrame(pulse);
      };
      pulseFrameRef.current = requestAnimationFrame(pulse);

      // Load world geometry, copy numeric id into properties, feed the source.
      fetch(GEO_URL)
        .then((res) => res.json())
        .then((topo) => {
          const fc = feature(topo, topo.objects.countries) as unknown as {
            features: CountryFeature[];
          };
          for (const f of fc.features) {
            f.properties = f.properties ?? {};
            // Topojson ids are zero-padded 3-digit strings ("032" = Argentina)
            // while NUMERIC_TO_ALPHA2 keys are unpadded — canonicalize here so
            // every country with a numeric code < 100 actually matches.
            const rawId = String(f.id ?? '');
            f.properties[ISO_N3] = /^-?\d+$/.test(rawId) ? String(parseInt(rawId, 10)) : rawId;
            unwrapAntimeridian(f.geometry as { type: string; coordinates: unknown });
          }
          const src = map.getSource('world') as maplibregl.GeoJSONSource | undefined;
          src?.setData(fc as unknown as GeoJSON.FeatureCollection);
          dataReadyRef.current = true;
          applySelected(map, selectedCountryId);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to load world map geography:', err);
        });

      // --- Interaction. ---
      map.on('mouseenter', 'countries-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'countries-fill', () => {
        map.getCanvas().style.cursor = '';
        popupRef.current?.remove();
        hoveredIsoRef.current = null;
        if (map.getLayer('countries-hover')) {
          map.setFilter('countries-hover', ['==', ['get', ISO_N3], '___none___']);
        }
      });
      map.on('mousemove', 'countries-fill', (e: MapLayerMouseEvent) => {
        const num = e.features?.[0]?.properties?.[ISO_N3] as string | undefined;
        const a2 = num ? NUMERIC_TO_ALPHA2[num] : undefined;
        const country = a2 ? countriesRef.current.find((c) => c.id === a2) : undefined;

        const hoverTarget = country && num ? num : '___none___';
        if (hoveredIsoRef.current !== hoverTarget && map.getLayer('countries-hover')) {
          hoveredIsoRef.current = hoverTarget;
          map.setFilter('countries-hover', ['==', ['get', ISO_N3], hoverTarget]);
        }

        if (!country) {
          popupRef.current?.remove();
          return;
        }
        const gdp = country.gdpUsd !== null ? ` · ${formatGdpShort(country.gdpUsd)}` : '';
        const score = macroScoresRef.current?.find((s) => s.countryId === country.id);
        const conflict = conflictSummaryRef.current?.find((s) => s.countryId === country.id);
        const html =
          `<div style="font:600 13px var(--font-inter),system-ui;color:rgb(var(--color-text-primary));">${country.name}</div>` +
          `<div style="font:12px var(--font-inter),system-ui;color:rgb(var(--color-text-secondary));">${country.status}${gdp}</div>` +
          populationPopupHtml(country) +
          macroScorePopupHtml(score) +
          (colorModeRef.current === 'conflict' ? conflictPopupHtml(conflict) : '');
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        }
        popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      map.on('click', 'countries-fill', (e: MapLayerMouseEvent) => {
        const num = e.features?.[0]?.properties?.[ISO_N3] as string | undefined;
        const a2 = num ? NUMERIC_TO_ALPHA2[num] : undefined;
        if (a2 && countriesRef.current.some((c) => c.id === a2)) onSelectRef.current(a2);
      });
    });

    return () => {
      if (pulseFrameRef.current !== null) cancelAnimationFrame(pulseFrameRef.current);
      pulseFrameRef.current = null;
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      dataReadyRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recolour when countries / statuses / active layer / layer data change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer('countries-fill')) return;
    map.setPaintProperty(
      'countries-fill',
      'fill-color',
      buildFillColor(countries, colorMode, macroScores, conflictSummary),
    );
    // The conflict glow always reflects live status, independent of which
    // choropleth layer is active — it's "this country is at war right now",
    // not a property of the selected layer.
    const cn = conflictNumerics(countries);
    const conflictFilter =
      cn.length > 0
        ? (['in', ['get', ISO_N3], ['literal', cn]] as unknown as maplibregl.FilterSpecification)
        : (['==', ['get', ISO_N3], '___none___'] as unknown as maplibregl.FilterSpecification);
    for (const id of ['conflict-glow-outer', 'conflict-glow-mid', 'conflict-glow-core']) {
      if (map.getLayer(id)) map.setFilter(id, conflictFilter);
    }
  }, [countries, colorMode, macroScores, conflictSummary]);

  // Re-tint untracked land when the light/dark theme toggles (the fill is a
  // baked expression MapLibre can't recompute from CSS on its own).
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      const map = mapRef.current;
      if (!map || !loadedRef.current || !map.getLayer('countries-fill')) return;
      map.setPaintProperty(
        'countries-fill',
        'fill-color',
        buildFillColor(countriesRef.current, colorModeRef.current, macroScoresRef.current, conflictSummaryRef.current),
      );
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Update selected outline + glide the camera to the chosen country.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applySelected(map, selectedCountryId);

    if (selectedCountryId) {
      const country = countriesRef.current.find((c) => c.id === selectedCountryId);
      if (country && country.latitude !== null && country.longitude !== null) {
        map.flyTo({
          center: [country.longitude, country.latitude],
          zoom: Math.max(map.getZoom(), 2.6),
          duration: 1400,
          curve: 1.6,
          essential: true,
        });
      }
    }
  }, [selectedCountryId]);

  return (
    // Ocean backdrop lives in the .map-ocean CSS class (theme-aware
    // gradient + ambient texture in dark mode) — see globals.css.
    <div className="map-ocean relative h-full w-full">
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function applySelected(map: InstanceType<typeof maplibregl.Map>, selectedId: string | null) {
  let num = '___none___';
  if (selectedId) {
    for (const [n, a2] of Object.entries(NUMERIC_TO_ALPHA2)) {
      if (a2 === selectedId) {
        num = n;
        break;
      }
    }
  }
  for (const layerId of ['selected-outline', 'selected-halo']) {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, ['==', ['get', ISO_N3], num]);
    }
  }
}
