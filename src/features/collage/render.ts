/**
 * Dessin du collage sur un canevas. Même fonction pour l'aperçu (petit) et l'export (taille de
 * l'écran) : le rendu est identique, seule la résolution change.
 */
import { isLightColor } from './colors';
import { type Framing, sourceRect } from './framing';
import { type Cell, type LayoutId, type Size, layoutCells, photoWindow } from './layouts';
import type { CollageStyle } from './slots';

/** Photo prête à être dessinée : image décodée, sa taille réelle et son cadrage. */
export interface DrawnPhoto {
  source: ImageBitmap;
  size: Size;
  framing: Framing;
}

export interface RenderOptions {
  /** Aperçu : les cases sans photo apparaissent en creux (jamais à l'export). */
  placeholders?: boolean;
}

/** Pixels du canevas par pixel de l'écran : l'espacement et les coins gardent les mêmes proportions à toute taille. */
export function screenUnit(canvasWidth: number, screen: { width: number; density: number }): number {
  return (canvasWidth * screen.density) / screen.width;
}

const CARD_COLOR = '#fdfcf8';

export function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCell(ctx: CanvasRenderingContext2D, cell: Cell, photo: DrawnPhoto | null, hole: string | null) {
  ctx.save();
  ctx.translate(cell.cx, cell.cy);
  if (cell.rotation !== 0) ctx.rotate(cell.rotation);

  if (cell.framed) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = cell.width * 0.05;
    ctx.shadowOffsetY = cell.width * 0.015;
    ctx.fillStyle = CARD_COLOR;
    roundedRectPath(ctx, -cell.width / 2, -cell.height / 2, cell.width, cell.height, cell.radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const view = photoWindow(cell);
  roundedRectPath(ctx, view.x, view.y, view.width, view.height, cell.photoRadius);
  if (photo) {
    ctx.clip();
    const src = sourceRect(photo.size, view, photo.framing);
    ctx.drawImage(photo.source, src.x, src.y, src.width, src.height, view.x, view.y, view.width, view.height);
  } else if (hole) {
    ctx.fillStyle = hole;
    ctx.fill();
  }
  ctx.restore();
}

/** Dessine tout le collage ; `unit` : pixels du canevas par pixel de l'écran (voir `screenUnit`). */
export function renderCollage(
  ctx: CanvasRenderingContext2D,
  layout: LayoutId,
  style: CollageStyle,
  photos: readonly (DrawnPhoto | null)[],
  width: number,
  height: number,
  unit: number,
  options: RenderOptions = {},
) {
  const cells = layoutCells(layout, width, height, { gap: style.spacing * unit, radius: style.corners * unit });
  // Case vide (aperçu seulement) : creux clair sur fond sombre, sombre sur fond clair ; toujours sombre dans un polaroïd blanc.
  const plainHole = isLightColor(style.background) ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.18)';
  const holeFor = (cell: Cell) => (!options.placeholders ? null : cell.framed ? 'rgba(0, 0, 0, 0.1)' : plainHole);
  ctx.save();
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  cells.forEach((cell, i) => drawCell(ctx, cell, photos[i] ?? null, holeFor(cell)));
  ctx.restore();
}

/** Rendu à la taille exacte de l'écran, encodé en JPEG (data URL) pour l'enregistrer côté natif. */
export async function exportCollage(
  layout: LayoutId,
  style: CollageStyle,
  photos: readonly (DrawnPhoto | null)[],
  screen: { width: number; height: number; density: number },
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = screen.width;
  canvas.height = screen.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  renderCollage(ctx, layout, style, photos, screen.width, screen.height, screen.density);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  canvas.width = canvas.height = 0;
  return dataUrl;
}
