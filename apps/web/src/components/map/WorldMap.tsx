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

// Features that cross the antimeridian (Russia, Fiji) have rings whose
// longitudes jump from +180 to -180 mid-ring. Rendered naively, that jump
// draws a fill band across the entire map. Unwrapping keeps each ring
// continuous (letting longitudes exceed ±180), which MapLibre renders
// correctly on the adjacent world copy.
function unwrapRing(ring: number[][]): void {
  for (let i = 1; i < ring.length; i++) {
    const prevLon = ring[i - 1][0];
    let lon = ring[i][0];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    ring[i] = [lon, ring[i][1]];
  }
}

function unwrapAntimeridian(geometry: {
  type: string;
  coordinates: unknown;
}): void {
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
      renderWorldCopies: true,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      loadedRef.current = true;

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

      // Selected-country white outline.
      map.addLayer({
        id: 'selected-outline',
        type: 'line',
        source: 'world',
        filter: ['==', ['get', ISO_N3], '___none___'],
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.95 },
      });

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
      });
      map.on('mousemove', 'countries-fill', (e: MapLayerMouseEvent) => {
        const num = e.features?.[0]?.properties?.[ISO_N3] as string | undefined;
        const a2 = num ? NUMERIC_TO_ALPHA2[num] : undefined;
        const country = a2 ? countriesRef.current.find((c) => c.id === a2) : undefined;
        if (!country) {
          popupRef.current?.remove();
          return;
        }
        const gdp = country.gdpUsd !== null ? ` · ${formatGdpShort(country.gdpUsd)}` : '';
        const html =
          `<div style="font:600 12px system-ui;color:#fff;">${country.name}</div>` +
          `<div style="font:11px system-ui;color:#9aa3b2;">${country.status}${gdp}</div>`;
        if (!popupRef.current) {
          popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
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

  // Update selected outline.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applySelected(map, selectedCountryId);
  }, [selectedCountryId]);

  return (
    <div
      className="relative h-full w-full"
      style={{
        // Ocean: navy water tokens (--color-map-ocean-*), subtly vignetted
        // toward the edges. Painted here in CSS (not in the MapLibre style)
        // so it stays theme-aware via the CSS variables.
        background:
          'radial-gradient(ellipse at 50% 40%, rgb(var(--color-map-ocean-1)) 0%, rgb(var(--color-map-ocean-2)) 100%)',
      }}
    >
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function applySelected(map: InstanceType<typeof maplibregl.Map>, selectedId: string | null) {
  if (!map.getLayer('selected-outline')) return;
  let num = '___none___';
  if (selectedId) {
    for (const [n, a2] of Object.entries(NUMERIC_TO_ALPHA2)) {
      if (a2 === selectedId) {
        num = n;
        break;
      }
    }
  }
  map.setFilter('selected-outline', ['==', ['get', ISO_N3], num]);
}
