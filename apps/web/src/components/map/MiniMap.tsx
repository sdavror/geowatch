'use client';

import { useEffect, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { feature } from 'topojson-client';
import type { Country } from '@geowatch/shared-types';
import { STATUS_COLOR } from '@geowatch/shared-types';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/visionscarto-world-atlas@1/world/110m.json';

// See WorldMap.tsx for the full explanation: the visionscarto topojson file
// has two top-level objects ('land' and 'countries'), and react-simple-maps'
// built-in URL loader has no way to know we want 'countries' — it silently
// picks the wrong one, rendering an empty map. We fetch and convert it
// ourselves instead, the same as WorldMap does.
interface CountryFeature {
  type: 'Feature';
  id?: string | number;
  geometry: unknown;
  properties?: Record<string, unknown>;
}

interface MiniMapProps {
  countries: Country[];
  onSelectCountry?: (id: string) => void;
}

export function MiniMap({ countries, onSelectCountry }: MiniMapProps) {
  const [countryFeatures, setCountryFeatures] = useState<CountryFeature[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(GEO_URL)
      .then((res) => res.json())
      .then((topo) => {
        if (cancelled) return;
        const converted = feature(topo, topo.objects.countries) as unknown as {
          features: CountryFeature[];
        };
        setCountryFeatures(converted.features);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load mini map geography:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ComposableMap
      projection="geoEqualEarth"
      projectionConfig={{ scale: 110 }}
      className="h-full w-full"
    >
      <Geographies geography={{ type: 'FeatureCollection', features: countryFeatures }}>
        {({ geographies }: { geographies: Array<{ rsmKey: string }> }) =>
          geographies.map((geo) => (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill="rgb(var(--color-bg-3))"
              stroke="rgb(var(--color-border) / 0.3)"
              strokeWidth={0.4}
              style={{ default: { outline: 'none' }, hover: { outline: 'none' }, pressed: { outline: 'none' } }}
            />
          ))
        }
      </Geographies>

      {countries
        .filter((c) => c.latitude !== null && c.longitude !== null)
        .map((c) => (
          <Marker
            key={c.id}
            coordinates={[c.longitude as number, c.latitude as number]}
            onClick={() => onSelectCountry?.(c.id)}
          >
            <circle
              r={3.5}
              fill={STATUS_COLOR[c.status]}
              style={{ cursor: onSelectCountry ? 'pointer' : 'default' }}
            />
          </Marker>
        ))}
    </ComposableMap>
  );
}
