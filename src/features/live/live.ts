import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import type { NormalizedRect } from '@/shared/native';
import { PrismeLive } from '@/shared/native/automation';
import { DEFAULT_UNLOCK, type UnlockPrefs } from './playlist';

interface LiveState {
  wallpaper: Wallpaper | null;
  intensity: number;
  /** « Changer à chaque déverrouillage » : interrupteur, fréquence et source des fonds. */
  unlock: UnlockPrefs;
  setIntensity: (intensity: number) => void;
  updateUnlock: (patch: Partial<UnlockPrefs>) => void;
}

export const useLive = create<LiveState>()(
  persist(
    (set) => ({
      wallpaper: null,
      intensity: 0.5,
      unlock: DEFAULT_UNLOCK,
      setIntensity: (intensity) => set({ intensity }),
      updateUnlock: (patch) => set((s) => ({ unlock: { ...s.unlock, ...patch } })),
    }),
    {
      name: 'prisme-live',
      partialize: ({ wallpaper, intensity, unlock }) => ({ wallpaper, intensity, unlock }),
      // Fusion profonde : un réglage ajouté plus tard prend sa valeur par défaut.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<LiveState>;
        return { ...current, ...saved, unlock: { ...current.unlock, ...saved.unlock } };
      },
    },
  ),
);

/**
 * Prépare le fond animé côté natif ; la première fois, Android affiche son écran de confirmation.
 * Renvoie un message à afficher.
 */
export async function setLiveWallpaper(wallpaper: Wallpaper, crop?: NormalizedRect): Promise<string> {
  const { intensity } = useLive.getState();
  const { status } = await PrismeLive.setLiveWallpaper({ uri: applyUri(wallpaper), intensity, crop });
  useLive.setState({ wallpaper });
  return status === 'updated' ? 'Fond animé mis à jour' : 'Confirme dans l’écran Android pour activer le fond animé';
}
