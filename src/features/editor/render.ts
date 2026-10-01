import { drawGrain } from '@/shared/lib/noise';
import type { NormalizedRect } from '@/shared/native';

export interface Size {
  width: number;
  height: number;
}

export type GradientStyle = 'none' | 'top' | 'bottom' | 'vignette';

export interface EditParams {
  /** 0..1 */
  blur: number;
  dim: number;
  grain: number;
  grayscale: boolean;
  gradient: { style: GradientStyle; color: string; strength: number };
  text: { value: string; size: number; color: string; position: number; bold: boolean };
}

export const DEFAULT_EDIT: EditParams = {
  blur: 0,
  dim: 0,
  grain: 0,
  grayscale: false,
  gradient: { style: 'none', color: '#000000', strength: 0.6 },
  text: { value: '', size: 0.4, color: '#ffffff', position: 0.5, bold: true },
};

export function isNeutral(p: EditParams): boolean {
  return p.blur === 0 && p.dim === 0 && p.grain === 0 && !p.grayscale && p.gradient.style === 'none' && !p.text.value.trim();
}

/** Plus grande zone centrée de l'image au ratio voulu (comportement « cover »), normalisée. */
export function coverCrop(source: Size, targetAspect: number): NormalizedRect {
  const sourceAspect = source.width / source.height;
  if (sourceAspect > targetAspect) {
    const width = targetAspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceAspect / targetAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Resserre un recadrage autour de son centre (variante « zoom » des fonds liés). */
export function zoomCrop(crop: NormalizedRect, factor: number): NormalizedRect {
  const f = Math.max(1, factor);
  const width = crop.width / f;
  const height = crop.height / f;
  return { x: crop.x + (crop.width - width) / 2, y: crop.y + (crop.height - height) / 2, width, height };
}

/** Zone source effectivement dessinée : recadrage demandé, sinon « cover » au ratio de sortie. */
export function effectiveCrop(source: Size, crop: NormalizedRect | undefined, width: number, height: number): NormalizedRect {
  return crop ?? coverCrop(source, width / height);
}

export function textFontSize(size: number, width: number): number {
  return Math.round((0.04 + size * 0.1) * width);
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Dessine la zone recadrée avec les effets, à la taille demandée. Même fonction pour l'aperçu
 * (petit) et l'export (taille de l'écran) : le rendu est identique, seule la résolution change.
 */
export function renderEdit(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  width: number,
  height: number,
) {
  const c = effectiveCrop(sourceSize, crop, width, height);
  const sx = c.x * sourceSize.width;
  const sy = c.y * sourceSize.height;
  const sw = c.width * sourceSize.width;
  const sh = c.height * sourceSize.height;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const filters: string[] = [];
  const blurPx = params.blur * 0.035 * width;
  if (blurPx > 0.3) filters.push(`blur(${blurPx.toFixed(1)}px)`);
  if (params.grayscale) filters.push('grayscale(1)');
  ctx.filter = filters.length ? filters.join(' ') : 'none';
  // Avec le flou, on déborde un peu pour éviter les bords qui pâlissent.
  const bleed = blurPx > 0.3 ? blurPx * 2 : 0;
  ctx.drawImage(source, sx, sy, sw, sh, -bleed, -bleed, width + bleed * 2, height + bleed * 2);
  ctx.filter = 'none';

  if (params.dim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${params.dim * 0.75})`;
    ctx.fillRect(0, 0, width, height);
  }

  const g = params.gradient;
  if (g.style !== 'none' && g.strength > 0) {
    let gradient: CanvasGradient;
    if (g.style === 'vignette') {
      gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.hypot(width, height) / 2);
    } else if (g.style === 'top') {
      gradient = ctx.createLinearGradient(0, 0, 0, height * 0.55);
    } else {
      gradient = ctx.createLinearGradient(0, height, 0, height * 0.45);
    }
    const strong = withAlpha(g.color, g.strength);
    const clear = withAlpha(g.color, 0);
    if (g.style === 'vignette') {
      gradient.addColorStop(0, clear);
      gradient.addColorStop(1, strong);
    } else {
      gradient.addColorStop(0, strong);
      gradient.addColorStop(1, clear);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawGrain(ctx, params.grain, width, height);

  const t = params.text;
  if (t.value.trim()) {
    const fontSize = textFontSize(t.size, width);
    ctx.font = `${t.bold ? 700 : 400} ${fontSize}px 'Google Sans Display', 'Google Sans', Roboto, system-ui, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = fontSize * 0.25;
    const lines = t.value.split('\n').slice(0, 6);
    const lineHeight = fontSize * 1.2;
    const top = t.position * height - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, width / 2, top + i * lineHeight, width * 0.9));
  }
  ctx.restore();
}

/** Rendu pleine taille encodé en JPEG (data URL) pour l'enregistrer côté natif. */
export async function exportEdit(
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  output: Size,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  renderEdit(ctx, source, sourceSize, crop, params, output.width, output.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  canvas.width = canvas.height = 0;
  return dataUrl;
}
