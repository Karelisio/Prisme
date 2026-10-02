import { t } from '@/shared/i18n';
import { PrismeWallpaper } from '@/shared/native';
import type { Wallpaper } from './types';

/** Ouvre le sélecteur de photos et renvoie l'image importée, ou null si l'utilisateur annule. */
export async function importFromGallery(): Promise<Wallpaper | null> {
  const result = await PrismeWallpaper.pickImage();
  if (result.cancelled) return null;
  const name = result.path.split('/').pop() ?? String(Date.now());
  return {
    id: `device:${name}`,
    source: 'device',
    width: result.width,
    height: result.height,
    color: '#808080',
    alt: t('Image de la galerie'),
    thumb: result.thumbPath,
    preview: result.path,
    full: result.path,
  };
}

export const isLocalWallpaper = (w: Wallpaper) => w.source === 'device' || w.source === 'creation';
