'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Crimea as part of Ukraine (UN-recognised international borders).
// The demotiles basemap renders Crimea inconsistently — sometimes as a
// separate de-facto feature, sometimes with no stable ADM0_A3 we can
// reliably match against. Rather than depend on whatever the basemap
// happens to do, we overlay our own Crimea polygon and paint it with the
// exact same fill + glow as mainland Ukraine, so the two always read as a
// single continuous territory regardless of the basemap's geometry.
//
// Approximate outline of the Crimean peninsula (lng, lat), generalised to
// match the ~110m detail level of the basemap. Includes the Perekop
// isthmus so it visually connects to the mainland with no seam.
const CRIMEA_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { name: 'Crimea', partOf: 'UKR' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [33.55, 46.18],
        [33.65, 45.95],
        [33.30, 45.65],
        [33.55, 45.35],
        [33.05, 44.90],
        [33.55, 44.55],
        [34.10, 44.40],
        [34.80, 44.80],
        [35.45, 45.00],
        [36.10, 45.05],
        [36.65, 45.45],
        [36.40, 45.55],
        [35.85, 45.40],
        [35.40, 45.30],
        [34.80, 45.35],
        [35.30, 45.80],
        [35.10, 46.10],
        [34.55, 46.10],
        [34.05, 46.10],
        [33.55, 46.18],
      ],
    ],
  },
};

const UA_FILL = '#E24B4A';

export default function MapTestPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<typeof maplibregl.Map> | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [33, 47],
      zoom: 4,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.setPaintProperty('countries-fill', 'fill-color', [
        'match',
        ['get', 'ADM0_A3'],
        'UKR',
        UA_FILL,
        '#cccccc',
      ]);
      map.setPaintProperty('countries-fill', 'fill-opacity', [
        'match',
        ['get', 'ADM0_A3'],
        'UKR',
        1,
        0.6,
      ]);

      if (map.getLayer('crimea-fill')) {
        map.setPaintProperty('crimea-fill', 'fill-color', UA_FILL);
        map.setPaintProperty('crimea-fill', 'fill-opacity', 1);
      }

      map.addSource('crimea-ua', {
        type: 'geojson',
        data: CRIMEA_POLYGON,
      });
      map.addLayer({
        id: 'crimea-ua-fill',
        type: 'fill',
        source: 'crimea-ua',
        paint: {
          'fill-color': UA_FILL,
          'fill-opacity': 1,
        },
      });

      const countriesLayerDef = map
        .getStyle()
        .layers?.find((l) => l.id === 'countries-fill');
      const countriesSourceId =
        (countriesLayerDef as { source?: string } | undefined)?.source ?? 'countries';

      const glowLayers: Array<{
        id: string;
        color: string;
        width: number;
        opacity: number;
        blur?: number;
      }> = [
        { id: 'conflict-glow-outer', color: '#ff3b3b', width: 12, opacity: 0.25, blur: 4 },
        { id: 'conflict-glow-mid', color: '#ff3b3b', width: 6, opacity: 0.45, blur: 2 },
        { id: 'conflict-glow-core', color: '#ffffff', width: 1.5, opacity: 0.9 },
      ];

      for (const g of glowLayers) {
        map.addLayer({
          id: g.id,
          type: 'line',
          source: countriesSourceId,
          'source-layer': 'countries',
          filter: ['==', ['get', 'ADM0_A3'], 'UKR'],
          paint: {
            'line-color': g.color,
            'line-width': g.width,
            'line-opacity': g.opacity,
            ...(g.blur ? { 'line-blur': g.blur } : {}),
          },
        });
        map.addLayer({
          id: `${g.id}-crimea`,
          type: 'line',
          source: 'crimea-ua',
          paint: {
            'line-color': g.color,
            'line-width': g.width,
            'line-opacity': g.opacity,
            ...(g.blur ? { 'line-blur': g.blur } : {}),
          },
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <main className="flex h-screen flex-col bg-bg">
      <div className="border-b border-border/10 bg-bg-2 px-5 py-3 text-sm text-text-primary">
        MapLibre — Ukraine with Crimea unified as one territory
      </div>
      <div ref={mapContainer} className="flex-1" />
    </main>
  );
}
