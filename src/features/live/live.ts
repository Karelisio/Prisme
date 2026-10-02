import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import type { NormalizedRect } from '@/shared/native';
import { type LiveMode, PrismeLive } from '@/shared/native/automation';
import { DEFAULT_UNLOCK, type UnlockPrefs } from './playlist';

/** Réglages propres à un genre : objet libre, envoyé tel quel à la scène native. */
export type SceneSettings = Record<string, unknown>;

interface LiveState {
  /** Genre de fond animé affiché par le service Prisme. */
  mode: LiveMode;
  wallpaper: Wallpaper | null;
  intensity: number;
  /** « Changer à chaque déverrouillage » : interrupteur, fréquence et source des fonds. */
  unlock: UnlockPrefs;
  /** Double-tap sur l'écran d'accueil : image suivante, ou variante selon le genre. */
  doubleTap: boolean;
  /** Le fond se fige en économie d'énergie ou quand la batterie est faible. */
  eco: boolean;
  scenes: Partial<Record<LiveMode, SceneSettings>>;
  setMode: (mode: LiveMode) => void;
  setIntensity: (intensity: number) => void;
  updateUnlock: (patch: Partial<UnlockPrefs>) => void;
  setDoubleTap: (doubleTap: boolean) => void;
  setEco: (eco: boolean) => void;
  updateScene: (mode: LiveMode, patch: SceneSettings) => void;
}

export const useLive = create<LiveState>()(
  persist(
    (set) => ({
      mode: 'image',
      wallpaper: null,
      intensity: 0.5,
      unlock: DEFAULT_UNLOCK,
      doubleTap: false,
      eco: true,
      scenes: {},
      setMode: (mode) => set({ mode }),
      setIntensity: (intensity) => set({ intensity }),
      updateUnlock: (patch) => set((s) => ({ unlock: { ...s.unlock, ...patch } })),
      setDoubleTap: (doubleTap) => set({ doubleTap }),
      setEco: (eco) => set({ eco }),
      updateScene: (mode, patch) => set((s) => ({ scenes: { ...s.scenes, [mode]: { ...s.scenes[mode], ...patch } } })),
    }),
    {
      name: 'prisme-live',
      partialize: ({ mode, wallpaper, intensity, unlock, doubleTap, eco, scenes }) => ({ mode, wallpaper, intensity, unlock, doubleTap, eco, scenes }),
      // Fusion profonde : un réglage ajouté plus tard prend sa valeur par défaut.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<LiveState>;
        return { ...current, ...saved, unlock: { ...current.unlock, ...saved.unlock }, scenes: { ...current.scenes, ...saved.scenes } };
      },
    },
  ),
);

/** Réglages du genre [mode], complétés par [defaults], et de quoi les modifier. */
export function useSceneSettings<T extends SceneSettings>(mode: LiveMode, defaults: T): [T, (patch: Partial<T>) => void] {
  const stored = useLive((s) => s.scenes[mode]);
  const updateScene = useLive((s) => s.updateScene);
  return [{ ...defaults, ...stored } as T, (patch) => updateScene(mode, patch)];
}

/** Configuration envoyée au natif pour le genre [mode] (par défaut, celui en cours). */
export function liveConfiguration(mode: LiveMode = useLive.getState().mode) {
  const { eco, doubleTap, scenes } = useLive.getState();
  return { mode, eco, doubleTap, settings: scenes[mode] ?? {} };
}

const activatedMessage = (status: string) =>
  status === 'launched' ? 'Confirme dans l’écran Android pour activer le fond animé' : 'Fond animé mis à jour';

/**
 * Photo avec parallaxe : prépare l'image côté natif ; la première fois, Android affiche son écran de
 * confirmation. Renvoie un message à afficher.
 */
export async function setLiveWallpaper(wallpaper: Wallpaper, crop?: NormalizedRect): Promise<string> {
  const { intensity } = useLive.getState();
  useLive.setState({ mode: 'image' });
  await PrismeLive.configure(liveConfiguration('image'));
  const { status } = await PrismeLive.setLiveWallpaper({ uri: applyUri(wallpaper), intensity, crop });
  useLive.setState({ wallpaper });
  return activatedMessage(status);
}

/**
 * Genres dont le natif a déjà ce qu'il faut (dégradés, particules, ou média déjà préparé) : envoie le
 * genre et ses réglages, puis ouvre l'écran d'Android si le fond Prisme n'est pas encore actif.
 */
export async function activateLiveMode(mode: LiveMode): Promise<string> {
  useLive.setState({ mode });
  await PrismeLive.configure(liveConfiguration(mode));
  const { status } = await PrismeLive.activate();
  return activatedMessage(status);
}
