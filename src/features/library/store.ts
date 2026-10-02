import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Wallpaper } from '@/features/sources/types';
import { idbStorage } from '@/shared/lib/idbStorage';
import type { NormalizedRect, WallpaperTarget } from '@/shared/native';
import * as model from './model';
import type { LibraryData, OfflineCopy } from './model';

interface LibraryActions {
  toggleFavorite: (w: Wallpaper) => boolean;
  createCollection: (name: string, first?: Wallpaper) => string;
  renameCollection: (id: string, name: string) => void;
  deleteCollection: (id: string) => void;
  setInCollection: (collectionId: string, w: Wallpaper, included: boolean) => void;
  addHistory: (
    w: Wallpaper,
    target: WallpaperTarget,
    options?: { auto?: boolean; at?: number; crop?: NormalizedRect; uri?: string },
  ) => void;
  ensureCollection: (id: string, name: string) => void;
  removeHistory: (entryId: string) => void;
  clearHistory: () => void;
  setOffline: (id: string, copy: OfflineCopy | null) => void;
}

export type LibraryState = LibraryData & LibraryActions & { hydrated: boolean };

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      ...model.EMPTY_LIBRARY,
      hydrated: false,
      toggleFavorite: (w) => {
        set((s) => model.toggleFavorite(s, w, Date.now()));
        return !!get().favorites[w.id];
      },
      createCollection: (name, first) => {
        const id = crypto.randomUUID();
        set((s) => model.createCollection(s, id, name, Date.now(), first));
        return id;
      },
      renameCollection: (id, name) => set((s) => model.renameCollection(s, id, name)),
      deleteCollection: (id) => set((s) => model.deleteCollection(s, id)),
      setInCollection: (collectionId, w, included) => set((s) => model.setInCollection(s, collectionId, w, included)),
      addHistory: (w, target, options) =>
        set((s) =>
          model.addHistory(
            s,
            {
              id: crypto.randomUUID(),
              wallpaperId: w.id,
              target,
              at: options?.at ?? Date.now(),
              ...(options?.auto && { auto: true }),
              ...(options?.crop && { crop: options.crop }),
              ...(options?.uri && { uri: options.uri }),
            },
            w,
          ),
        ),
      ensureCollection: (id, name) => set((s) => model.ensureCollection(s, id, name, Date.now())),
      removeHistory: (entryId) => set((s) => model.removeHistory(s, entryId)),
      clearHistory: () => set((s) => model.clearHistory(s)),
      setOffline: (id, copy) =>
        set((s) => {
          const offline = { ...s.offline };
          if (copy) offline[id] = copy;
          else delete offline[id];
          return { offline };
        }),
    }),
    {
      name: 'prisme-library',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ items, favorites, collections, history, offline }) => ({ items, favorites, collections, history, offline }),
      onRehydrateStorage: () => () => useLibrary.setState({ hydrated: true }),
    },
  ),
);

export const isFavoriteSelector = (id: string) => (s: LibraryState) => !!s.favorites[id];
