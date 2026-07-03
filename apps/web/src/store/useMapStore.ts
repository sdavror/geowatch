import { create } from 'zustand';
import type { CountryStatus } from '@geowatch/shared-types';

interface MapStore {
  selectedCountryId: string | null;
  statusFilter: CountryStatus | null;
  regionFilter: string | null;
  selectCountry: (id: string | null) => void;
  setStatusFilter: (status: CountryStatus | null) => void;
  setRegionFilter: (region: string | null) => void;
}

// Note the curried call create<T>()(...) — required by Zustand's TypeScript
// typings (the extra parentheses are not a typo).
export const useMapStore = create<MapStore>()((set) => ({
  selectedCountryId: null,
  statusFilter: null,
  regionFilter: null,
  selectCountry: (id: string | null) => set({ selectedCountryId: id }),
  setStatusFilter: (status: CountryStatus | null) => set({ statusFilter: status }),
  setRegionFilter: (region: string | null) => set({ regionFilter: region }),
}));
