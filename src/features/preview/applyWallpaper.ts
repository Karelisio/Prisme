import { useLibrary } from '@/features/library/store';
import { setLiveWallpaper } from '@/features/live/live';
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

/** Choix proposés par la feuille « Appliquer sur ». */
export type ApplyChoice = WallpaperTarget | 'live' | 'linked';

/** Applique une création (éditeur, générateur) selon le choix ; renvoie le message à afficher. */
export async function applyCreation(creation: Wallpaper, choice: Exclude<ApplyChoice, 'linked'>): Promise<string> {
  if (choice === 'live') return setLiveWallpaper(creation);
  await applyWallpaper({ wallpaper: creation, target: choice });
  return `Fond appliqué : ${TARGET_LABELS[choice].toLowerCase()}`;
}
