import { create } from 'zustand';
import type { Wallpaper } from '@/features/sources/types';

export type Tab = 'explore' | 'library' | 'settings';

/** Écrans empilés au-dessus des onglets ; le bouton retour les ferme dans l'ordre inverse. */
export type Overlay =
  | { type: 'preview'; wallpaper: Wallpaper }
  | { type: 'search' }
  | { type: 'pack'; packId: string }
  | { type: 'collection'; collectionId: string }
  | { type: 'diagnostics' }
  | { type: 'dynamic' }
  | { type: 'live' }
  | { type: 'rotation' };

export type OverlayEntry = Overlay & { key: number };

interface NavigationState {
  tab: Tab;
  overlays: OverlayEntry[];
  setTab: (tab: Tab) => void;
  push: (overlay: Overlay) => void;
  pop: () => void;
  /** Remplace l'écran du dessus (ex. passer d'un aperçu à un autre). */
  replace: (overlay: Overlay) => void;
}

let nextKey = 1;

export const useNavigation = create<NavigationState>((set) => ({
  tab: 'explore',
  overlays: [],
  setTab: (tab) => set({ tab, overlays: [] }),
  push: (overlay) => set((s) => ({ overlays: [...s.overlays, { ...overlay, key: nextKey++ }] })),
  pop: () => set((s) => ({ overlays: s.overlays.slice(0, -1) })),
  replace: (overlay) => set((s) => ({ overlays: [...s.overlays.slice(0, -1), { ...overlay, key: nextKey++ }] })),
}));

export const openPreview = (wallpaper: Wallpaper) => useNavigation.getState().push({ type: 'preview', wallpaper });
export const goBack = () => useNavigation.getState().pop();
