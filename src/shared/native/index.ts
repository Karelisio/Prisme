import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PrismeWallpaperPlugin } from './definitions';

export * from './definitions';

export const PrismeWallpaper = registerPlugin<PrismeWallpaperPlugin>('PrismeWallpaper', {
  web: () => import('./web').then((m) => new m.PrismeWallpaperWeb()),
});

export const isNative = Capacitor.isNativePlatform();

/** URL affichable dans la WebView pour un chemin renvoyé par le plugin (fichier local ou URL distante). */
export function toWebUrl(path: string): string {
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return Capacitor.convertFileSrc(path);
}

/** Message lisible pour une erreur renvoyée par le plugin natif. */
export function nativeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Une erreur inattendue est survenue';
}
