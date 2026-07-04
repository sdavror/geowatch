'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { Country } from '@geowatch/shared-types';
import { STATUS_COLOR } from '@geowatch/shared-types';
import { NUMERIC_TO_ALPHA2 } from '@/lib/isoNumericMap';

interface WorldMapProps {
  countries: Country[];
  selectedCountryId: string | null;
  onSelectCountry: (id: string) => void;
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
// draws a fill band across the entire map. We fix it in two steps:
// 1. unwrap each ring so it's continuous (longitudes may exceed ±180),
// 2. cut the polygon along the ±180 line into two pieces, shifting the
//    overflowing piece back into [-180, 180].
// The cut (instead of relying on world copies to render the overflow) is
// what lets us run with renderWorldCopies: false — a single world with no
// repeating continents.
function unwrapRing(ring: number[][]): number[][] {
  const out: number[][] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prevLon = out[i - 1][0];
    let lon = ring[i][0];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  return out;
}

// Sutherland–Hodgman clip of a ring against the half-plane lon <= bound
// (side = 'left') or lon >= bound (side = 'right').
function clipRing(ring: number[][], bound: number, side: 'left' | 'right'): number[][] {
  const inside = (p: number[]) => (side === 'left' ? p[0] <= bound : p[0] >= bound);
  const intersect = (a: number[], b: number[]): number[] => {
    const t = (bound - a[0]) / (b[0] - a[0]);
    return [bound, a[1] + t * (b[1] - a[1])];
  };
  const out: number[][] = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  if (out.length >= 3) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([...first]);
  }
  return out.length >= 4 ? out : [];
}

// Splits a Polygon/MultiPolygon at the antimeridian; returns MultiPolygon
// coordinates entirely within [-180, 180].
function cutAntimeridian(geometry: { type: string; coordinates: unknown }): void {
  const polygons: number[][][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][])
        : [];
  if (polygons.length === 0) return;

  const result: number[][][][] = [];
  for (const polygon of polygons) {
    const rings = polygon.map(unwrapRing);
    const lons = rings.flatMap((r) => r.map((p) => p[0]));
    const maxLon = Math.max(...lons);
    const minLon = Math.min(...lons);

    if (maxLon > 180) {
      const left = rings.map((r) => clipRing(r, 180, 'left')).filter((r) => r.length > 0);
      const right = rings
        .map((r) => clipRing(r, 180, 'right').map((p) => [p[0] - 360, p[1]]))
        .filter((r) => r.length > 0);
      if (left.length) result.push(left);
      if (right.length) result.push(right);
    } else if (minLon < -180) {
      const right = rings.map((r) => clipRing(r, -180, 'right')).filter((r) => r.length > 0);
      const left = rings
        .map((r) => clipRing(r, -180, 'left').map((p) => [p[0] + 360, p[1]]))
        .filter((r) => r.length > 0);
      if (right.length) result.push(right);
      if (left.length) result.push(left);
    } else {
      result.push(rings);
    }
  }

  geometry.type = 'MultiPolygon';
  geometry.coordinates = result;
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
    `<div style="font:11px -apple-system,system-ui;color:rgb(var(--color-text-secondary));">` +
    `${formatPopulationShort(country.population)}${arrow}</div>`
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

// Untracked land uses the --color-map-land token (#0a0c10) — darker than
// the ocean, matching the original design where water reads as navy and
// land without data reads as near-black silhouette.
const UNTRACKED_LAND_FILL = '#0a0c10';

// Builds the fill-color match expression: each tracked country's numeric
// ISO code → its status colour; untracked land → neutral dark fill.
function buildFillColor(countries: Country[]): maplibregl.ExpressionSpecification {
  const alpha2ToNumeric = new Map<string, string>();
  for (const [num, a2] of Object.entries(NUMERIC_TO_ALPHA2)) alpha2ToNumeric.set(a2, num);

  const stops: string[] = [];
  for (const c of countries) {
    const num = alpha2ToNumeric.get(c.id);
    if (!num) continue;
    stops.push(num, STATUS_COLOR[c.status]);
  }
  if (stops.length === 0) {
    return ['literal', UNTRACKED_LAND_FILL] as unknown as maplibregl.ExpressionSpecification;
  }
  return [
    'match',
    ['get', ISO_N3],
    ...stops,
    UNTRACKED_LAND_FILL,
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

export function WorldMap({ countries, selectedCountryId, onSelectCountry }: WorldMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<typeof maplibregl.Map> | null>(null);
  const loadedRef = useRef(false);
  const dataReadyRef = useRef(false);
  const popupRef = useRef<InstanceType<typeof maplibregl.Popup> | null>(null);
  const pulseFrameRef = useRef<number | null>(null);
  const hoveredIsoRef = useRef<string | null>(null);
  const countriesRef = useRef(countries);
  const onSelectRef = useRef(onSelectCountry);
  countriesRef.current = countries;
  onSelectRef.current = onSelectCountry;

  // --- Init map once. ------------------------------------------------------
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: buildBaseStyle(),
      center: [20, 30],
      zoom: 1.4,
      minZoom: 1,
      maxZoom: 8,
      attributionControl: false,
      // Single world — no repeating continents. The geometry is cut at the
      // antimeridian (see cutAntimeridian) so nothing depends on copies.
      // Note: no maxBounds — on wide viewports at low zoom the world is
      // narrower than the screen, and clamping the camera against bounds
      // in that state misbehaves.
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      loadedRef.current = true;

      // With renderWorldCopies: false MapLibre clamps min zoom to fit the
      // world's WIDTH, so on wide screens the top/bottom would crop. Frame
      // the view on the inhabited latitudes (Patagonia → northern
      // Scandinavia) so every continent is on screen at once.
      map.fitBounds(
        [
          [-180, -58],
          [180, 74],
        ],
        { padding: 0, duration: 0 },
      );

      // Untracked-land fill (drawn first, under the choropleth match — the
      // match itself already handles both, so this single fill layer covers
      // everything; tracked countries get their status colour, the rest the
      // neutral fallback).
      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'world',
        paint: {
          'fill-color': buildFillColor(countriesRef.current),
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
            try {
              cutAntimeridian(f.geometry as { type: string; coordinates: unknown });
            } catch (err) {
              // One malformed feature must not blank the whole map.
              // eslint-disable-next-line no-console
              console.error(`Antimeridian cut failed for feature ${rawId}:`, err);
            }
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
        const html =
          `<div style="font:600 12px -apple-system,system-ui;color:rgb(var(--color-text-primary));">${country.name}</div>` +
          `<div style="font:11px -apple-system,system-ui;color:rgb(var(--color-text-secondary));">${country.status}${gdp}</div>` +
          populationPopupHtml(country);
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

  // Recolour when countries / statuses change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer('countries-fill')) return;
    map.setPaintProperty('countries-fill', 'fill-color', buildFillColor(countries));
    const cn = conflictNumerics(countries);
    const conflictFilter =
      cn.length > 0
        ? (['in', ['get', ISO_N3], ['literal', cn]] as unknown as maplibregl.FilterSpecification)
        : (['==', ['get', ISO_N3], '___none___'] as unknown as maplibregl.FilterSpecification);
    for (const id of ['conflict-glow-outer', 'conflict-glow-mid', 'conflict-glow-core']) {
      if (map.getLayer(id)) map.setFilter(id, conflictFilter);
    }
  }, [countries]);

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
