import { create } from 'zustand';
import type { Photographer } from '@/features/discover/store';
import type { Wallpaper } from '@/features/sources/types';
import type { NormalizedRect } from '@/shared/native';

export type Tab = 'explore' | 'library' | 'settings';

/** Écrans empilés au-dessus des onglets ; le bouton retour les ferme dans l'ordre inverse. */
export type Overlay =
  /** `list` : fonds voisins (grille d'origine) pour passer de l'un à l'autre en balayant. */
  | { type: 'preview'; wallpaper: Wallpaper; list?: Wallpaper[] }
  | { type: 'search' }
  | { type: 'pack'; packId: string }
  | { type: 'collection'; collectionId: string }
  | { type: 'diagnostics' }
  | { type: 'dynamic' }
  | { type: 'live' }
  | { type: 'rotation' }
  | { type: 'music' }
  | { type: 'places' }
  | { type: 'editor'; wallpaper: Wallpaper; crop?: NormalizedRect }
  | { type: 'generator' }
  | { type: 'focus' }
  /** « Plus comme ça » : fonds du même sujet ou de la même couleur. */
  | { type: 'similar'; wallpaper: Wallpaper }
  | { type: 'photographer'; photographer: Photographer }
  /** Réglages › Contenus masqués. */
  | { type: 'hidden' }
  | { type: 'events' }
  | { type: 'dim' };

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

export const openPreview = (wallpaper: Wallpaper, list?: Wallpaper[]) =>
  useNavigation.getState().push({ type: 'preview', wallpaper, list });
export const goBack = () => useNavigation.getState().pop();
