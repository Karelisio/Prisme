import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { trackUnsplashDownload } from '@/features/sources/unsplash';
import { t } from '@/shared/i18n';
import { PrismeWallpaper } from '@/shared/native';
import { sourceName } from './InfoSheet';

const fileName = (w: Wallpaper) => `Prisme_${w.id}`;

/** Crédit du photographe et lien vers la photo, comme le demandent Unsplash et Pexels. */
export function shareText(w: Wallpaper): string {
  const credit = w.author ? t('Photo de {author} sur {source}', { author: w.author.name, source: sourceName(w) }) : '';
  return [credit, w.pageUrl].filter(Boolean).join(' : ');
}

/** Unsplash compte un téléchargement quand la photo quitte l'app (exigence de l'API). */
function trackDownload(w: Wallpaper) {
  if (w.source === 'unsplash' && w.downloadLocation) void trackUnsplashDownload(w.downloadLocation);
}

export async function saveToGallery(w: Wallpaper): Promise<string> {
  await PrismeWallpaper.saveToGallery({ uri: applyUri(w), id: w.id, name: fileName(w) });
  trackDownload(w);
  return t('Enregistré dans la galerie (album Prisme)');
}

export async function shareWallpaper(w: Wallpaper): Promise<void> {
  const text = shareText(w);
  await PrismeWallpaper.shareImage({ uri: applyUri(w), id: w.id, name: fileName(w), text: text || undefined, title: t('Partager le fond') });
  trackDownload(w);
}
