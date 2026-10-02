import type { GridLayout } from '@/features/settings/store';

/** Écart entre deux vignettes (px), commun à la grille et à la mosaïque. */
export const GRID_GAP = 8;
/** Marges latérales de la grille (px) : 12 de chaque côté. */
export const GRID_MARGIN = 24;

/** Hauteur / largeur d'une vignette de la grille à colonnes égales (portrait 9:16). */
export const CELL_RATIO = 16 / 9;

/** Bornes de la hauteur d'une vignette de mosaïque (hauteur / largeur) : ni bandeau, ni colonne infinie. */
export const MOSAIC_MIN_RATIO = 0.62;
export const MOSAIC_MAX_RATIO = 2.1;

/** Largeur visée d'une colonne de mosaïque : 2 colonnes sur téléphone, davantage sur tablette ou en paysage. */
const MOSAIC_COLUMN_WIDTH = 170;
const MOSAIC_MAX_COLUMNS = 5;

export interface MosaicTile {
  /** Position dans la liste d'origine. */
  index: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MosaicLayout {
  columns: number;
  tiles: MosaicTile[];
  /** Hauteur totale : celle de la colonne la plus longue. */
  height: number;
}

/** Hauteur / largeur d'une vignette : le format de l'image, borné ; format inconnu → celui de la grille. */
export function tileRatio(size: { width: number; height: number }): number {
  if (!(size.width > 0) || !(size.height > 0)) return CELL_RATIO;
  return Math.min(MOSAIC_MAX_RATIO, Math.max(MOSAIC_MIN_RATIO, size.height / size.width));
}

/** Nombre de colonnes de la mosaïque pour une largeur de grille donnée. */
export function mosaicColumns(width: number, gap = GRID_GAP): number {
  if (!(width > 0)) return 2;
  const fit = Math.round((width + gap) / (MOSAIC_COLUMN_WIDTH + gap));
  return Math.min(MOSAIC_MAX_COLUMNS, Math.max(2, fit));
}

/** Nombre de colonnes réellement affichées pour une disposition et la largeur de la grille. */
export function columnCount(layout: GridLayout, width: number): number {
  return layout === 'mosaic' ? mosaicColumns(width) : Number(layout);
}

/**
 * Répartit les vignettes en colonnes équilibrées : chacune va dans la colonne la moins haute
 * (la plus à gauche en cas d'égalité). Le placement ne dépend que des vignettes précédentes :
 * charger la page suivante n'en déplace aucune.
 */
export function layoutMosaic(ratios: readonly number[], columns: number, width: number, gap = GRID_GAP): MosaicLayout {
  const count = Math.max(1, Math.floor(columns));
  const columnWidth = Math.max(0, (width - gap * (count - 1)) / count);
  const bottoms = new Array<number>(count).fill(0);
  const tiles: MosaicTile[] = ratios.map((ratio, index) => {
    let column = 0;
    for (let c = 1; c < count; c++) if ((bottoms[c] as number) < (bottoms[column] as number)) column = c;
    const height = Math.round(columnWidth * ratio);
    const y = bottoms[column] as number;
    bottoms[column] = y + height + gap;
    return { index, column, x: column * (columnWidth + gap), y, width: columnWidth, height };
  });
  return { columns: count, tiles, height: tiles.length > 0 ? Math.max(...bottoms) - gap : 0 };
}

/** Vignettes qui rencontrent la fenêtre [top, bottom] (px, relatifs au haut de la grille). */
export function visibleTiles(layout: MosaicLayout, top: number, bottom: number): MosaicTile[] {
  return layout.tiles.filter((tile) => tile.y + tile.height >= top && tile.y <= bottom);
}

/** Hauteur de chaque colonne (sans l'écart final), pour vérifier l'équilibre. */
export function columnHeights(layout: MosaicLayout): number[] {
  const heights = new Array<number>(layout.columns).fill(0);
  for (const tile of layout.tiles) heights[tile.column] = tile.y + tile.height;
  return heights;
}
