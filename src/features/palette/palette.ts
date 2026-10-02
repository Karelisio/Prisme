import { QuantizerCelebi, Score, argbFromRgb, hexFromArgb } from '@material/material-color-utilities';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { PrismeWallpaper, isNative, toWebUrl } from '@/shared/native';
import { type ColorScheme, schemeFromSeed } from '@/shared/theme/scheme';

/** Taille d'analyse : Android calcule aussi les couleurs du fond sur une version réduite. */
const SAMPLE_SIZE = 112;

/**
 * Couleurs sources candidates d'une image, dans l'ordre où Android les propose
 * (quantification Celebi puis score Material, comme pour les couleurs dynamiques du système).
 */
export function seedsFromPixels(rgba: Uint8ClampedArray, desired = 4): number[] {
  const pixels: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 255) continue;
    pixels.push(argbFromRgb(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0));
  }
  return Score.score(QuantizerCelebi.quantize(pixels, 128), { desired });
}

export interface PaletteResult {
  seeds: string[];
}

export function schemesFor(seed: string): { light: ColorScheme; dark: ColorScheme } {
  return { light: schemeFromSeed(seed, false), dark: schemeFromSeed(seed, true) };
}

/** Analyse la miniature du fond (copie locale sur Android pour que le canvas reste lisible). */
export async function paletteOf(w: Wallpaper): Promise<PaletteResult> {
  const remote = w.source === 'unsplash' || w.source === 'pexels';
  const src = remote && isNative ? toWebUrl((await PrismeWallpaper.cacheImage({ url: w.thumb })).path) : toWebUrl(w.thumb);
  const blob = await (await fetch(src)).blob();
  const probe = await createImageBitmap(blob);
  const scale = SAMPLE_SIZE / Math.max(probe.width, probe.height);
  const width = Math.max(1, Math.round(probe.width * scale));
  const height = Math.max(1, Math.round(probe.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(t('Canvas indisponible'));
  ctx.drawImage(probe, 0, 0, width, height);
  probe.close();
  const seeds = seedsFromPixels(ctx.getImageData(0, 0, width, height).data).map(hexFromArgb);
  return { seeds };
}
