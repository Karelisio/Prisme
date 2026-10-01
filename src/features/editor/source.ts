import type { Wallpaper } from '@/features/sources/types';
import { withParams } from '@/shared/lib/http';
import { type NormalizedRect, PrismeWallpaper, isNative, toWebUrl } from '@/shared/native';
import { type Size, coverCrop } from './render';

export interface EditableImage {
  bitmap: ImageBitmap;
  size: Size;
}

/**
 * Charge l'image à éditer à la résolution utile seulement (zone recadrée → largeur de sortie),
 * pour ménager la mémoire des appareils modestes. Sur Android, l'image passe par une copie locale
 * (même origine que l'app) afin que le canvas reste exportable.
 */
export async function loadEditableImage(w: Wallpaper, crop: NormalizedRect | undefined, output: Size): Promise<EditableImage> {
  const cropWidth = (crop ?? coverCrop(w, output.width / output.height)).width;
  const neededWidth = Math.min(w.width, Math.ceil(output.width / cropWidth), 4096);

  let src: string;
  if (w.source === 'unsplash' || w.source === 'pexels') {
    const url = withParams(w.full, { w: neededWidth });
    src = isNative ? toWebUrl((await PrismeWallpaper.cacheImage({ url })).path) : url;
  } else {
    src = toWebUrl(w.full);
  }

  const response = await fetch(src);
  if (!response.ok) throw new Error('Image indisponible');
  const blob = await response.blob();
  const probe = await createImageBitmap(blob);
  if (probe.width <= neededWidth) return { bitmap: probe, size: { width: probe.width, height: probe.height } };
  // Image plus grande que nécessaire (fichier local) : redimensionnée dès le décodage.
  const resizeHeight = Math.round((probe.height * neededWidth) / probe.width);
  probe.close();
  const bitmap = await createImageBitmap(blob, { resizeWidth: neededWidth, resizeHeight, resizeQuality: 'high' });
  return { bitmap, size: { width: bitmap.width, height: bitmap.height } };
}
