import type { Wallpaper } from './types';

/** Fournisseurs qui redimensionnent à la volée selon le paramètre `w`. */
const RESIZABLE_HOSTS = new Set(['images.unsplash.com', 'images.pexels.com']);

/** Largeur suffisante pour couvrir l'écran (portrait) à l'échelle 1, sans dépasser l'original. */
export function coverWidth(image: { width: number; height: number }, screen: { width: number; height: number }): number {
  const imageRatio = image.width / image.height;
  const screenRatio = screen.width / screen.height;
  const width = imageRatio > screenRatio ? screen.height * imageRatio : screen.width;
  return Math.max(1, Math.min(image.width, Math.ceil(width)));
}

/** Variante « taille de l'écran » de l'image HD, pour économiser les données mobiles. */
export function screenSizedUrl(w: Wallpaper, screen: { width: number; height: number }): string {
  let url: URL;
  try {
    url = new URL(w.full);
  } catch {
    return w.full;
  }
  if (!RESIZABLE_HOSTS.has(url.hostname)) return w.full;
  url.searchParams.set('w', String(coverWidth(w, screen)));
  if (url.hostname === 'images.unsplash.com') url.searchParams.set('q', '80');
  return url.toString();
}
