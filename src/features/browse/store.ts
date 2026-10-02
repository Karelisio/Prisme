import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_FILTERS, type Filters } from '@/features/sources/types';

interface BrowseState {
  filters: Filters;
  category: string;
  recentSearches: string[];
  setFilters: (filters: Filters) => void;
  setCategory: (category: string) => void;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
}

const MAX_RECENT = 8;

export const useBrowse = create<BrowseState>()(
  persist(
    (set) => ({
      filters: DEFAULT_FILTERS,
      category: 'featured',
      recentSearches: [],
      setFilters: (filters) => set({ filters }),
      setCategory: (category) => set({ category }),
      addRecentSearch: (query) =>
        set((s) => {
          const q = query.trim();
          if (!q) return s;
          const others = s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase());
          return { recentSearches: [q, ...others].slice(0, MAX_RECENT) };
        }),
      removeRecentSearch: (query) => set((s) => ({ recentSearches: s.recentSearches.filter((r) => r !== query) })),
    }),
    // Les filtres restent le temps de la session ; seules les recherches récentes sont mémorisées.
    { name: 'prisme-browse', partialize: (s) => ({ recentSearches: s.recentSearches }) },
  ),
);

export const filtersActive = (f: Filters) => f.color !== null || f.ratio !== 'all' || f.amoled;
