import { create } from 'zustand';
import type { Photographer } from '@/features/discover/store';
import type { Wallpaper } from '@/features/sources/types';
import type { NormalizedRect } from '@/shared/native';
import { type Hero, flushPendingNavigation, previewStage, runTransition, thumbnailBelowPreview } from './transitions';

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
  /** Collage de 2 à 4 photos ; `wallpapers` préremplit les cases (ex. les favoris). */
  | { type: 'collage'; wallpapers?: Wallpaper[] }
  | { type: 'focus' }
  /** « Plus comme ça » : fonds du même sujet ou de la même couleur. */
  | { type: 'similar'; wallpaper: Wallpaper }
  | { type: 'photographer'; photographer: Photographer }
  /** Réglages › Contenus masqués. */
  | { type: 'hidden' }
  | { type: 'events' }
  | { type: 'dim' }
  | { type: 'quote' };

export type OverlayEntry = Overlay & { key: number };

interface NavigationState {
  tab: Tab;
  overlays: OverlayEntry[];
  setTab: (tab: Tab) => void;
  /** `hero` : élément qui s'agrandit d'un écran à l'autre (miniature → aperçu). */
  push: (overlay: Overlay, hero?: Hero) => void;
  pop: () => void;
  /** Remplace l'écran du dessus (ex. passer d'un aperçu à un autre). */
  replace: (overlay: Overlay) => void;
}

let nextKey = 1;

/**
 * Les changements d'écran passent par `runTransition` : animés quand c'est possible, et appliqués
 * au plus tard à l'image suivante. D'où le `flushPendingNavigation()` avant de lire l'état.
 */
export const useNavigation = create<NavigationState>((set, get) => ({
  tab: 'explore',
  overlays: [],
  setTab: (tab) => {
    flushPendingNavigation();
    const { tab: current, overlays } = get();
    if (current === tab && overlays.length === 0) return;
    runTransition(() => set({ tab, overlays: [] }), { kind: overlays.length > 0 ? 'back' : 'fade' });
  },
  push: (overlay, hero) => {
    flushPendingNavigation();
    const kind = hero ? 'hero-open' : overlay.type === 'preview' ? 'fade' : 'forward';
    runTransition(() => set((s) => ({ overlays: [...s.overlays, { ...overlay, key: nextKey++ }] })), { kind, hero });
  },
  pop: () => {
    flushPendingNavigation();
    const top = get().overlays.at(-1);
    // Aperçu : il rétrécit vers sa miniature, si elle est encore à l'écran.
    const hero = top?.type === 'preview' ? closingHero(top.wallpaper.id) : undefined;
    const kind = hero ? 'hero-close' : top?.type === 'preview' ? 'fade' : 'back';
    runTransition(() => set((s) => ({ overlays: s.overlays.slice(0, -1) })), { kind, hero });
  },
  replace: (overlay) => {
    flushPendingNavigation();
    set((s) => ({ overlays: [...s.overlays.slice(0, -1), { ...overlay, key: nextKey++ }] }));
  },
}));

/** Miniature qui s'agrandit en aperçu. */
const openingHero = (from: HTMLElement): Hero => ({ from, to: previewStage, waitForTo: true });

/** Scène de l'aperçu qui rétrécit vers la miniature du fond ; undefined si celle-ci n'est pas à l'écran. */
function closingHero(id: string): Hero | undefined {
  const from = previewStage();
  const thumbnail = from ? thumbnailBelowPreview(id) : null;
  return from && thumbnail ? { from, to: () => (thumbnail.isConnected ? thumbnail : null) } : undefined;
}

/** `from` : miniature touchée dans la grille, pour l'animer jusqu'à l'aperçu. */
export const openPreview = (wallpaper: Wallpaper, list?: Wallpaper[], from?: HTMLElement | null) =>
  useNavigation.getState().push({ type: 'preview', wallpaper, list }, from ? openingHero(from) : undefined);
export const goBack = () => useNavigation.getState().pop();
