/**
 * Cadrage d'une photo dans sa case : ajustement « couvrir » (la photo remplit toute la fenêtre),
 * puis déplacement et zoom bornés pour qu'aucun bord vide n'apparaisse jamais. Fonctions pures.
 */
import type { Rect, Size } from './layouts';

/**
 * Cadrage indépendant de la taille de la case et de la résolution de l'image : `zoom` ≥ 1 (1 = la
 * photo couvre juste la fenêtre) et centre de la zone visible, en parts de l'image (0..1).
 */
export interface Framing {
  zoom: number;
  cx: number;
  cy: number;
}

export interface Point {
  x: number;
  y: number;
}

export const DEFAULT_FRAMING: Framing = { zoom: 1, cx: 0.5, cy: 0.5 };
export const MAX_ZOOM = 4;

const clamp = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value)));

/** Échelle « couvrir » (pixels de fenêtre par pixel d'image) au zoom 1. */
export function coverScale(image: Size, view: Size): number {
  return Math.max(view.width / image.width, view.height / image.height);
}

/** Demi-largeur et demi-hauteur de la zone visible, en parts de l'image. */
function halfVisible(image: Size, view: Size, zoom: number): Point {
  const scale = coverScale(image, view) * zoom;
  return { x: view.width / scale / image.width / 2, y: view.height / scale / image.height / 2 };
}

/** Ramène le cadrage dans ses bornes : zoom entre 1 et MAX_ZOOM, zone visible dans l'image. */
export function clampFraming(framing: Framing, image: Size, view: Size): Framing {
  if (image.width <= 0 || image.height <= 0 || view.width <= 0 || view.height <= 0) return DEFAULT_FRAMING;
  const zoom = clamp(framing.zoom, 1, MAX_ZOOM);
  const half = halfVisible(image, view, zoom);
  return { zoom, cx: clamp(framing.cx, half.x, 1 - half.x), cy: clamp(framing.cy, half.y, 1 - half.y) };
}

/** Zone de l'image (en pixels d'image) qui s'affiche dans la fenêtre. */
export function sourceRect(image: Size, view: Size, framing: Framing): Rect {
  const f = clampFraming(framing, image, view);
  const scale = coverScale(image, view) * f.zoom;
  const width = Math.min(image.width, view.width / scale);
  const height = Math.min(image.height, view.height / scale);
  return {
    x: clamp(f.cx * image.width - width / 2, 0, image.width - width),
    y: clamp(f.cy * image.height - height / 2, 0, image.height - height),
    width,
    height,
  };
}

/** Déplace le contenu de (dx, dy) pixels de fenêtre : la photo suit le doigt. */
export function panFraming(framing: Framing, dx: number, dy: number, image: Size, view: Size): Framing {
  const scale = coverScale(image, view) * framing.zoom;
  return clampFraming({ ...framing, cx: framing.cx - dx / (scale * image.width), cy: framing.cy - dy / (scale * image.height) }, image, view);
}

/**
 * Zoom de `factor` autour d'un point, exprimé en pixels de fenêtre depuis le centre de la fenêtre :
 * le point de la photo qui se trouve dessous y reste (pincement, molette).
 */
export function zoomFraming(framing: Framing, factor: number, anchor: Point, image: Size, view: Size): Framing {
  const zoom = clamp(framing.zoom * factor, 1, MAX_ZOOM);
  const base = coverScale(image, view);
  const before = base * framing.zoom;
  const after = base * zoom;
  const px = framing.cx * image.width + anchor.x / before;
  const py = framing.cy * image.height + anchor.y / before;
  return clampFraming({ zoom, cx: (px - anchor.x / after) / image.width, cy: (py - anchor.y / after) / image.height }, image, view);
}

/** Vrai si la photo est simplement centrée, sans zoom ni déplacement. */
export function isDefaultFraming(framing: Framing): boolean {
  return framing.zoom < 1.001 && Math.abs(framing.cx - 0.5) < 0.001 && Math.abs(framing.cy - 0.5) < 0.001;
}

/** Vecteur exprimé dans le repère d'une case tournée de `rotation` radians (sens horaire). */
export function toCellFrame(vector: Point, rotation: number): Point {
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos };
}

/** Budget de pixels accordé à chaque photo décodée (mémoire des appareils modestes). */
export const MAX_DECODED_PIXELS = 5_000_000;
const MAX_DECODED_WIDTH = 4096;
/** Réserve de zoom : la photo reste nette jusqu'à ce facteur sur la plus grande case. */
const ZOOM_HEADROOM = 1.5;

/**
 * Largeur (px) à laquelle décoder une photo pour qu'elle couvre sans flou la plus grande de ces
 * fenêtres, avec un peu de réserve de zoom, sans dépasser l'image d'origine ni le budget mémoire.
 */
export function decodeWidth(photo: Size, windows: readonly Size[]): number {
  const aspect = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;
  let wanted = 0;
  for (const w of windows) wanted = Math.max(wanted, w.width, w.height * aspect);
  const budget = Math.floor(Math.sqrt(MAX_DECODED_PIXELS * aspect));
  const natural = photo.width > 0 ? photo.width : MAX_DECODED_WIDTH;
  return Math.max(256, Math.min(Math.ceil(wanted * ZOOM_HEADROOM), budget, natural, MAX_DECODED_WIDTH));
}
