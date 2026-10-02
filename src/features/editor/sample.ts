import type { Size } from './geometry';
import { dominantColors } from './quantize';

/** Côté (px) de la vignette sur laquelle les couleurs sont mesurées : largement assez, et très rapide. */
const SAMPLE_SIDE = 48;
const PALETTE_SIZE = 5;

const cache = new WeakMap<object, string[]>();

/**
 * Couleurs dominantes de la photo, de la plus présente à la moins présente (« #rrggbb »).
 * Mesurées une seule fois par image : le rendu les réclame à chaque aperçu.
 */
export function dominantPalette(source: CanvasImageSource, size: Size): string[] {
  const cached = cache.get(source);
  if (cached) return cached;
  const scale = SAMPLE_SIDE / Math.max(size.width, size.height);
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let colors: string[] = [];
  if (ctx) {
    ctx.drawImage(source, 0, 0, width, height);
    colors = dominantColors(ctx.getImageData(0, 0, width, height).data, PALETTE_SIZE);
  }
  cache.set(source, colors);
  return colors;
}

/** Couleur dominante de la photo (noir si elle est illisible). */
export function dominantColorOf(source: CanvasImageSource, size: Size): string {
  return dominantPalette(source, size)[0] ?? '#000000';
}
