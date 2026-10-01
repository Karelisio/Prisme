import type { NormalizedRect } from '@/shared/native';

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Position de l'image dans la scène : `scale` en pixels de scène par pixel d'image,
 * (x, y) = coin supérieur gauche de l'image dans la scène.
 */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Échelle minimale pour que l'image couvre toute la scène. */
export function coverScale(stage: Size, image: Size): number {
  return Math.max(stage.width / image.width, stage.height / image.height);
}

export function initialTransform(stage: Size, image: Size): Transform {
  const scale = coverScale(stage, image);
  return { scale, x: (stage.width - image.width * scale) / 2, y: (stage.height - image.height * scale) / 2 };
}

/** Garde l'image entre « couvre la scène » et MAX_ZOOM, sans jamais laisser de bord vide. */
export function clampTransform(t: Transform, stage: Size, image: Size): Transform {
  const min = coverScale(stage, image);
  const scale = clamp(t.scale, min, min * MAX_ZOOM);
  const w = image.width * scale;
  const h = image.height * scale;
  return { scale, x: clamp(t.x, stage.width - w, 0), y: clamp(t.y, stage.height - h, 0) };
}

/** Zoom de `factor` autour d'un point de la scène (le point sous les doigts reste fixe). */
export function zoomAt(t: Transform, factor: number, point: Point, stage: Size, image: Size): Transform {
  const min = coverScale(stage, image);
  const scale = clamp(t.scale * factor, min, min * MAX_ZOOM);
  const k = scale / t.scale;
  return clampTransform({ scale, x: point.x - (point.x - t.x) * k, y: point.y - (point.y - t.y) * k }, stage, image);
}

/** Zone visible de l'image, normalisée (0..1) : c'est le recadrage envoyé au plugin natif. */
export function cropFromTransform(t: Transform, stage: Size, image: Size): NormalizedRect {
  const width = Math.min(1, stage.width / t.scale / image.width);
  const height = Math.min(1, stage.height / t.scale / image.height);
  return {
    x: clamp(-t.x / t.scale / image.width, 0, 1 - width),
    y: clamp(-t.y / t.scale / image.height, 0, 1 - height),
    width,
    height,
  };
}

export function transformFromCrop(crop: NormalizedRect, stage: Size, image: Size): Transform {
  const scale = stage.width / (crop.width * image.width);
  return clampTransform({ scale, x: -crop.x * image.width * scale, y: -crop.y * image.height * scale }, stage, image);
}

/** Vrai si l'utilisateur n'a ni zoomé ni déplacé l'image (recadrage centré par défaut). */
export function isDefaultTransform(t: Transform, stage: Size, image: Size): boolean {
  const base = initialTransform(stage, image);
  return Math.abs(t.scale / base.scale - 1) < 0.01 && Math.abs(t.x - base.x) < 1 && Math.abs(t.y - base.y) < 1;
}

/**
 * Scène au ratio exact de l'écran physique, inscrite dans la zone d'affichage : identique à la
 * zone d'affichage en mode bord à bord, avec bandes noires sinon.
 */
export function fitStage(viewport: Size, screenRatio: number): Size {
  const ratio = viewport.height / viewport.width;
  if (Math.abs(ratio - screenRatio) / screenRatio < 0.03) return viewport;
  if (ratio > screenRatio) return { width: viewport.width, height: viewport.width * screenRatio };
  return { width: viewport.height / screenRatio, height: viewport.height };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
