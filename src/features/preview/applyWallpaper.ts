import { useLibrary } from '@/features/library/store';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { trackUnsplashDownload } from '@/features/sources/unsplash';
import { type NormalizedRect, PrismeWallpaper, type WallpaperTarget } from '@/shared/native';

export const TARGET_LABELS: Record<WallpaperTarget, string> = {
  home: "Écran d'accueil",
  lock: 'Écran de verrouillage',
  both: 'Accueil et verrouillage',
};

export interface ApplyRequest {
  wallpaper: Wallpaper;
  target: WallpaperTarget;
  crop?: NormalizedRect;
  /** Image déjà préparée (éditeur, fonds liés) : remplace la source du fond. */
  uri?: string;
}

/**
 * Applique un fond : pleine résolution à ce moment-là seulement (copie hors ligne si elle existe),
 * puis historique et suivi de téléchargement Unsplash.
 */
export async function applyWallpaper({ wallpaper, target, crop, uri }: ApplyRequest): Promise<void> {
  await PrismeWallpaper.setWallpaper({
    uri: uri ?? applyUri(wallpaper),
    target,
    crop: uri ? undefined : crop,
    id: wallpaper.id,
  });
  useLibrary.getState().addHistory(wallpaper, target);
  if (wallpaper.source === 'unsplash' && wallpaper.downloadLocation) {
    void trackUnsplashDownload(wallpaper.downloadLocation);
  }
}
