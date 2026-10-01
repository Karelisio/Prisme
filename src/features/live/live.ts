import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import type { NormalizedRect } from '@/shared/native';
import { PrismeLive } from '@/shared/native/automation';

interface LiveState {
  wallpaper: Wallpaper | null;
  intensity: number;
  setIntensity: (intensity: number) => void;
}

export const useLive = create<LiveState>()(
  persist(
    (set) => ({
      wallpaper: null,
      intensity: 0.5,
      setIntensity: (intensity) => set({ intensity }),
    }),
    { name: 'prisme-live', partialize: ({ wallpaper, intensity }) => ({ wallpaper, intensity }) },
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
