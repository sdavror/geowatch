'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import dynamic from 'next/dynamic';
import { useCountries, useCountry } from '@/hooks/useCountries';
import { useMacroScores, useConflictSummary } from '@/hooks/useMacroScores';
import { useMapStore } from '@/store/useMapStore';
import { MapLegend } from '@/components/map/MapLegend';
import { RegionFilterPanel } from '@/components/sidebar/RegionFilterPanel';
import { CountrySidebar } from '@/components/sidebar/CountrySidebar';
import { StatusBadge } from '@/components/sidebar/StatusBadge';
import { GdpIndicator } from '@/components/sidebar/GdpIndicator';
import { PopulationIndicator } from '@/components/sidebar/PopulationIndicator';
import { STATUS_COLOR, STATUS_LABEL } from '@geowatch/shared-types';
import type { CountryStatus } from '@geowatch/shared-types';
import type { MapColorMode } from '@/components/map/WorldMap';

// react-simple-maps relies on browser globals (no SSR), so load it client-only.
const WorldMap = dynamic(
  () => import('@/components/map/WorldMap').then((m) => m.WorldMap),
  { ssr: false },
);

const STATUS_ORDER: CountryStatus[] = ['conflict', 'crisis', 'unstable', 'stable'];

const LAYER_OPTIONS: Array<{ mode: MapColorMode; label: string }> = [
  { mode: 'stability', label: 'Stability' },
  { mode: 'health', label: 'Country Health' },
  { mode: 'conflict', label: 'Conflict' },
];

export default function MapPage() {
  const {
    selectedCountryId,
    selectCountry,
    statusFilter,
    setStatusFilter,
    regionFilter,
    setRegionFilter,
  } = useMapStore();

  // Two country lists serve different purposes:
  // - `countries` (unfiltered by region) feeds the region panel, so its
  //   region list and per-status counts always reflect the whole world.
  // - `filteredCountries` is what's actually drawn on the map.
  const { countries } = useCountries();
  const { countries: filteredCountries, isLoading, isError } = useCountries({
    status: statusFilter ?? undefined,
    region: regionFilter ?? undefined,
  });
  const { country: selectedCountry } = useCountry(selectedCountryId);
  const { scores: macroScores } = useMacroScores();
  const { summary: conflictSummary } = useConflictSummary();
  const [search, setSearch] = useState('');
  const [colorMode, setColorMode] = useState<MapColorMode>('stability');

  const visibleCountries = search
    ? filteredCountries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : filteredCountries;

  return (
    <main className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <header className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border/10 bg-bg-2/70 px-4 backdrop-blur-xl">
        <Logo />
        <Link href="/" className="text-[12px] text-text-tertiary transition-colors hover:text-brand-text">
          ← Back to feed
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full border border-status-conflict/30 bg-status-conflict/15 px-2 py-0.5 text-[11px] text-status-conflict">
            ● LIVE
          </span>
          <input
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder="Search countries..."
            className="w-40 rounded-full border border-border/10 bg-bg-3/60 px-3 py-1 text-xs text-text-primary backdrop-blur-md transition-all placeholder:text-text-tertiary focus:w-52 focus:border-accent-blue focus:outline-none"
          />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <RegionFilterPanel
          countries={countries}
          regionFilter={regionFilter}
          onSelectRegion={setRegionFilter}
          statusFilter={statusFilter}
          onSelectStatus={(s) => setStatusFilter(s)}
        />

        {/* Map area */}
        <div className="relative flex-1">
          {isError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/90">
              <p className="max-w-sm text-center text-xs text-status-conflict">
                Failed to load country data. Make sure the API is running and
                reachable at NEXT_PUBLIC_API_URL.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border/10 border-t-accent-blue" />
            </div>
          )}

          <WorldMap
            countries={visibleCountries}
            selectedCountryId={selectedCountryId}
            onSelectCountry={selectCountry}
            macroScores={macroScores}
            conflictSummary={conflictSummary}
            colorMode={colorMode}
          />

          {/* Layer switcher — top center, matches the map-page control style */}
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-1 rounded-full border border-border/10 bg-bg-2/60 p-1 shadow-lg backdrop-blur-xl">
            {LAYER_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => setColorMode(opt.mode)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  colorMode === opt.mode
                    ? 'bg-brand text-white'
                    : 'text-text-secondary hover:text-brand-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <MapLegend mode={colorMode} />

          {/* Stats */}
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
            {STATUS_ORDER.slice(0, 2).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                className="min-w-[110px] rounded-2xl border px-3 py-2 text-left shadow-lg backdrop-blur-xl transition-all hover:scale-[1.03]"
                style={{
                  backgroundColor:
                    statusFilter === status ? `${STATUS_COLOR[status]}22` : 'rgba(17,20,24,0.55)',
                  borderColor:
                    statusFilter === status ? STATUS_COLOR[status] : 'rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-xl font-bold" style={{ color: STATUS_COLOR[status] }}>
                  {countries.filter((c) => c.status === status).length}
                </div>
                <div className="text-[11px] text-text-tertiary">{STATUS_LABEL[status]}</div>
              </button>
            ))}
          </div>

          {/* Compact floating country card — quick glance before opening the
              full detail sidebar, mirrors the reference dashboard's bottom-left card. */}
          {selectedCountry && (
            <div className="absolute bottom-4 left-4 z-10 w-64 rounded-2xl border border-border/10 bg-bg-2/60 p-3.5 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedCountry.flagEmoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text-primary">
                    {selectedCountry.name}
                  </div>
                  <div className="truncate text-[11px] text-text-tertiary">
                    {selectedCountry.capital} · Risk {selectedCountry.riskScore.toFixed(1)}
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={selectedCountry.status} />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-border/10 pt-2.5">
                <PopulationIndicator countryId={selectedCountry.id} />
                <GdpIndicator gdpUsd={selectedCountry.gdpUsd} />
              </div>
              <Link
                href={`/country/${selectedCountry.id}`}
                className="mt-3 block border-t border-border/10 pt-2.5 text-center text-[11px] font-medium text-brand-text hover:underline"
              >
                Full country profile ›
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <CountrySidebar countryId={selectedCountryId} onClose={() => selectCountry(null)} />
      </div>
    </main>
  );
}
