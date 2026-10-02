import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { withParams } from '@/shared/lib/http';
import { type NormalizedRect, PrismeWallpaper, isNative, toWebUrl } from '@/shared/native';
import { type Size, coverCrop } from './render';

export interface EditableImage {
  bitmap: ImageBitmap;
  size: Size;
}

/** Plus grande largeur décodée (px) ; au-delà, l'image est réduite dès le décodage. */
const MAX_WIDTH = 4096;
/** Plafond de pixels quand l'éditeur demande une résolution supérieure (rotation, zoom) : ~40 Mo décodés. */
const MAX_PIXELS = 10_000_000;

/**
 * Charge l'image à éditer à la résolution utile seulement (zone recadrée → largeur de sortie),
 * pour ménager la mémoire des appareils modestes. Sur Android, l'image passe par une copie locale
 * (même origine que l'app) afin que le canvas reste exportable.
 *
 * `minScale` (pixels chargés par pixel de l'original, de 0 à 1) demande davantage de résolution quand
 * le cadrage final en réclame : photo tournée, zoom poussé. Sans effet si l'image n'est pas plus grande.
 */
export async function loadEditableImage(w: Wallpaper, crop: NormalizedRect | undefined, output: Size, minScale = 0): Promise<EditableImage> {
  // Dimensions inconnues (certaines images NASA) : on décode à la taille maximale.
  const known = w.width > 0 && w.height > 0;
  const cropWidth = known ? (crop ?? coverCrop(w, output.width / output.height)).width : 1;
  const base = known ? Math.min(w.width, Math.ceil(output.width / cropWidth), MAX_WIDTH) : MAX_WIDTH;
  const requested = known ? Math.min(Math.ceil(w.width * minScale), MAX_WIDTH, Math.floor(Math.sqrt((MAX_PIXELS * w.width) / w.height))) : 0;
  const neededWidth = Math.max(base, Math.min(requested, w.width));

  let src: string;
  if (w.source === 'unsplash' || w.source === 'pexels') {
    const url = withParams(w.full, { w: neededWidth });
    src = isNative ? toWebUrl((await PrismeWallpaper.cacheImage({ url })).path) : url;
  } else {
    src = toWebUrl(w.full);
  }

  const response = await fetch(src);
  if (!response.ok) throw new Error(t('Image indisponible'));
  const blob = await response.blob();
  const probe = await createImageBitmap(blob);
  if (probe.width <= neededWidth) return { bitmap: probe, size: { width: probe.width, height: probe.height } };
  // Image plus grande que nécessaire (fichier local) : redimensionnée dès le décodage.
  const resizeHeight = Math.round((probe.height * neededWidth) / probe.width);
  probe.close();
  const bitmap = await createImageBitmap(blob, { resizeWidth: neededWidth, resizeHeight, resizeQuality: 'high' });
  return { bitmap, size: { width: bitmap.width, height: bitmap.height } };
}
