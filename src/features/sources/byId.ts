import { artArtwork } from './art';
import { nasaAsset } from './nasa';
import { pexelsPhoto } from './pexels';
import { pixabayImage } from './pixabay';
import { REMOTE_SOURCES } from './registry';
import type { RemoteSource, Wallpaper } from './types';
import { unsplashPhoto } from './unsplash';
import { wallhavenWallpaper } from './wallhaven';

const MAX_ID_LENGTH = 120;

/** « unsplash:abc » → source « unsplash » et identifiant chez la source « abc » (qui peut contenir « : »). */
export function splitId(id: string): { source: string; rest: string } | null {
  const colon = id.indexOf(':');
  if (colon <= 0 || colon === id.length - 1 || id.length > MAX_ID_LENGTH) return null;
  if (/[\u0000-\u001f]/.test(id)) return null;
  return { source: id.slice(0, colon), rest: id.slice(colon + 1) };
}

export const isRemoteSource = (source: string): source is RemoteSource => (REMOTE_SOURCES as readonly string[]).includes(source);

/**
 * Les six sources en ligne savent toutes renvoyer un fond par son identifiant. Les images
 * importées de la galerie, les créations (fichiers de ce téléphone) et les images de packs
 * (leur identifiant n'est qu'un rang dans un manifeste qui évolue) ne le savent pas.
 */
export function isRetrievableId(id: string): boolean {
  const parts = splitId(id);
  return !!parts && isRemoteSource(parts.source);
}

/**
 * Retrouve un fond par son identifiant « source:id » auprès de sa source : null s'il n'existe
 * plus, `ApiError` si la source ne répond pas (réseau, clé, limite de requêtes).
 */
export async function fetchWallpaperById(id: string, thumbWidth: number): Promise<Wallpaper | null> {
  const parts = splitId(id);
  if (!parts || !isRemoteSource(parts.source)) return null;
  const wallpaper = await fetchFrom(parts.source, parts.rest, thumbWidth);
  // Une source qui répondrait par un autre fond que celui demandé ne doit pas se glisser dans la bibliothèque.
  return wallpaper && wallpaper.id === id ? wallpaper : null;
}

function fetchFrom(source: RemoteSource, rest: string, thumbWidth: number): Promise<Wallpaper | null> {
  switch (source) {
    case 'unsplash':
      return unsplashPhoto(rest, thumbWidth);
    case 'pexels':
      return pexelsPhoto(rest, thumbWidth);
    case 'wallhaven':
      return wallhavenWallpaper(rest);
    case 'pixabay':
      return pixabayImage(rest);
    case 'art':
      return artArtwork(rest);
    case 'nasa':
      return nasaAsset(rest);
  }
}
