import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { PrismeWallpaper } from '@/shared/native';
import { useLibrary } from './store';

export const CREATIONS_ID = 'creations';

/**
 * Enregistre une image créée dans l'app (éditeur, générateur, fonds épurés) dans la collection « Créations ».
 * Le nom de la collection et la description (`alt`) sont enregistrés dans la langue de l'interface du moment.
 */
export async function saveCreation(dataUrl: string, color: string, alt = t('Création Prisme')): Promise<Wallpaper> {
  const name = `creation-${Date.now()}`;
  const image = await PrismeWallpaper.saveImage({ data: dataUrl, name });
  const wallpaper: Wallpaper = {
    id: `creation:${name}`,
    source: 'creation',
    width: image.width,
    height: image.height,
    color,
    alt,
    thumb: image.thumbPath,
    preview: image.path,
    full: image.path,
  };
  const library = useLibrary.getState();
  library.ensureCollection(CREATIONS_ID, t('Créations'));
  library.setInCollection(CREATIONS_ID, wallpaper, true);
  return wallpaper;
}
