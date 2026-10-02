import type { NormalizedRect } from '@/shared/native';

/**
 * Géométrie de la retouche : quarts de tour, miroir, redressement fin et zone choisie dans la photo.
 * Tout est exprimé sans dépendre de la résolution (zone en fractions de l'image, zoom relatif),
 * si bien que l'aperçu réduit et l'export à la taille de l'écran cadrent exactement la même chose.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Quarts de tour dans le sens horaire. */
export type Turns = 0 | 1 | 2 | 3;

/** Zone vue dans la photo orientée. */
export interface View {
  /** Centre de la zone, de 0 à 1 dans l'image orientée. */
  x: number;
  y: number;
  /** 1 : la zone couvre juste l'image (« cover », agrandissement du redressement compris). */
  zoom: number;
}

export interface Geometry {
  turns: Turns;
  /** Miroir horizontal de l'image affichée (après les quarts de tour). */
  mirror: boolean;
  /** Redressement fin en degrés (sens horaire), de −MAX_STRAIGHTEN à +MAX_STRAIGHTEN. */
  straighten: number;
  view: View;
}

/**
 * Où et comment dessiner l'image orientée dans la sortie : le point (cx, cy) de l'image est au centre,
 * à l'échelle `scale` (pixels de sortie par pixel d'image), l'image étant tournée de `angle` degrés.
 */
export interface Placement {
  cx: number;
  cy: number;
  scale: number;
  angle: number;
}

/** Matrice 2D au format canvas : x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const MAX_STRAIGHTEN = 15;
/** Même plafond que le zoom de l'aperçu : un recadrage venu de l'aperçu entre toujours dans la plage. */
export const MAX_ZOOM = 5;
/** Une photo inclinée est agrandie d'un poil de plus : jamais de liseré transparent sur les bords. */
const EDGE_MARGIN = 1.004;
const RAD = Math.PI / 180;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeTurns = (n: number): Turns => (((Math.round(n) % 4) + 4) % 4) as Turns;

export function orientedSize(source: Size, turns: Turns): Size {
  return turns % 2 === 0 ? { width: source.width, height: source.height } : { width: source.height, height: source.width };
}

/** Transformation de l'image source vers l'image orientée (quarts de tour horaires, puis miroir). */
export function orientationMatrix(source: Size, turns: Turns, mirror: boolean): Matrix {
  const { width: w, height: h } = source;
  const rotated: Matrix = turns === 0 ? [1, 0, 0, 1, 0, 0] : turns === 1 ? [0, 1, -1, 0, h, 0] : turns === 2 ? [-1, 0, 0, -1, w, h] : [0, -1, 1, 0, 0, w];
  if (!mirror) return rotated;
  const [a, b, c, d, e, f] = rotated;
  return [-a, b, -c, d, orientedSize(source, turns).width - e, f];
}

/**
 * Échelle minimale (pixels de sortie par pixel d'image) pour que la sortie, inclinée de `angle`
 * degrés, tienne tout entière dans l'image : c'est l'agrandissement automatique du redressement.
 */
export function coverScale(oriented: Size, out: Size, angle: number): number {
  const c = Math.abs(Math.cos(angle * RAD));
  const s = Math.abs(Math.sin(angle * RAD));
  return Math.max((c * out.width + s * out.height) / oriented.width, (s * out.width + c * out.height) / oriented.height);
}

/** Échelle du zoom 1 : couverture, avec la petite marge des bords quand l'image est inclinée. */
function baseScale(oriented: Size, out: Size, angle: number): number {
  return coverScale(oriented, out, angle) * (angle === 0 ? 1 : EDGE_MARGIN);
}

/** Demi-dimensions (dans l'image) de la boîte englobante de la sortie inclinée de `angle`. */
function halfExtent(out: Size, scale: number, angle: number): Point {
  const c = Math.abs(Math.cos(angle * RAD));
  const s = Math.abs(Math.sin(angle * RAD));
  return { x: (c * out.width + s * out.height) / (2 * scale), y: (s * out.width + c * out.height) / (2 * scale) };
}

const clampCenter = (value: number, half: number, size: number) => (half * 2 >= size ? size / 2 : clamp(value, half, size - half));

const clampStraighten = (degrees: number) => clamp(Number.isFinite(degrees) ? degrees : 0, -MAX_STRAIGHTEN, MAX_STRAIGHTEN);

/** Placement du mode « Remplir » : zone choisie, ramenée dans l'image (jamais de coin vide). */
export function resolvePlacement(source: Size, g: Geometry, out: Size): Placement {
  const o = orientedSize(source, g.turns);
  const angle = clampStraighten(g.straighten);
  const scale = baseScale(o, out, angle) * clamp(g.view.zoom, 1, MAX_ZOOM);
  const half = halfExtent(out, scale, angle);
  return {
    cx: clampCenter(g.view.x * o.width, half.x, o.width),
    cy: clampCenter(g.view.y * o.height, half.y, o.height),
    scale,
    angle,
  };
}

/** Coins de la sortie, dans les coordonnées de l'image orientée. */
export function placementCorners(p: Placement, out: Size): Point[] {
  const cos = Math.cos(p.angle * RAD);
  const sin = Math.sin(p.angle * RAD);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const qx = (sx as number) * (out.width / 2);
    const qy = (sy as number) * (out.height / 2);
    return { x: p.cx + (qx * cos + qy * sin) / p.scale, y: p.cy + (-qx * sin + qy * cos) / p.scale };
  });
}

/** Zone du recadrage venu de l'aperçu (photo non tournée), sinon zone centrée. */
export function viewFromCrop(crop: NormalizedRect | undefined, source: Size, out: Size): View {
  if (!crop || crop.width <= 0 || crop.height <= 0) return { x: 0.5, y: 0.5, zoom: 1 };
  const scale = out.width / (crop.width * source.width);
  return {
    x: crop.x + crop.width / 2,
    y: crop.y + crop.height / 2,
    zoom: clamp(scale / coverScale(source, out, 0), 1, MAX_ZOOM),
  };
}

/** Géométrie de départ de l'éditeur : photo droite, cadrée comme dans l'aperçu. */
export function initialGeometry(crop: NormalizedRect | undefined, source: Size, out: Size): Geometry {
  return clampGeometry({ turns: 0, mirror: false, straighten: 0, view: viewFromCrop(crop, source, out) }, source, out);
}

/** Ramène tous les réglages dans leurs bornes (redressement, zoom, centre de la zone). */
export function clampGeometry(g: Geometry, source: Size, out: Size): Geometry {
  const o = orientedSize(source, g.turns);
  const p = resolvePlacement(source, g, out);
  return {
    turns: g.turns,
    mirror: g.mirror,
    straighten: p.angle,
    view: { x: p.cx / o.width, y: p.cy / o.height, zoom: clamp(g.view.zoom, 1, MAX_ZOOM) },
  };
}

export function straightenGeometry(g: Geometry, degrees: number, source: Size, out: Size): Geometry {
  return clampGeometry({ ...g, straighten: degrees }, source, out);
}

/**
 * Quart de tour de la photo affichée (+1 : sens horaire). Le point au centre du cadre y reste et le
 * zoom (relatif à la couverture) est conservé : on tourne la photo dans le cadre, quatre quarts de tour
 * ramènent exactement au point de départ.
 */
export function rotateGeometry(g: Geometry, direction: 1 | -1, source: Size, out: Size): Geometry {
  const before = resolvePlacement(source, g, out);
  const o = orientedSize(source, g.turns);
  const u = before.cx / o.width;
  const v = before.cy / o.height;
  // Miroir actif : la photo affichée tourne dans le sens horaire quand l'image source tourne dans l'autre.
  const turns = normalizeTurns(g.turns + (g.mirror ? -direction : direction));
  const zoom = g.view.zoom;
  return clampGeometry({ ...g, turns, view: direction === 1 ? { x: 1 - v, y: u, zoom } : { x: v, y: 1 - u, zoom } }, source, out);
}

/** Miroir de la photo affichée : la zone et l'inclinaison suivent, pour que le résultat soit le reflet exact. */
export function mirrorGeometry(g: Geometry, source: Size, out: Size): Geometry {
  return clampGeometry({ ...g, mirror: !g.mirror, straighten: g.straighten === 0 ? 0 : -g.straighten, view: { ...g.view, x: 1 - g.view.x } }, source, out);
}

/** Déplace la photo de (dx, dy) pixels de sortie : le point sous le doigt suit le doigt. */
export function panGeometry(g: Geometry, source: Size, out: Size, dx: number, dy: number): Geometry {
  const p = resolvePlacement(source, g, out);
  const o = orientedSize(source, g.turns);
  const cos = Math.cos(p.angle * RAD);
  const sin = Math.sin(p.angle * RAD);
  const ix = (dx * cos + dy * sin) / p.scale;
  const iy = (-dx * sin + dy * cos) / p.scale;
  return clampGeometry({ ...g, view: { ...g.view, x: (p.cx - ix) / o.width, y: (p.cy - iy) / o.height } }, source, out);
}

/**
 * Zoome de `factor` autour de `anchor` (pixels de sortie, relatifs au centre de la sortie) :
 * le point de la photo sous l'ancre y reste.
 */
export function zoomGeometry(g: Geometry, source: Size, out: Size, factor: number, anchor: Point = { x: 0, y: 0 }): Geometry {
  const p = resolvePlacement(source, g, out);
  const o = orientedSize(source, g.turns);
  const zoom = clamp(clamp(g.view.zoom, 1, MAX_ZOOM) * factor, 1, MAX_ZOOM);
  const scale = (p.scale / clamp(g.view.zoom, 1, MAX_ZOOM)) * zoom;
  const cos = Math.cos(p.angle * RAD);
  const sin = Math.sin(p.angle * RAD);
  const rx = anchor.x * cos + anchor.y * sin;
  const ry = -anchor.x * sin + anchor.y * cos;
  const x = p.cx + rx / p.scale - rx / scale;
  const y = p.cy + ry / p.scale - ry / scale;
  return clampGeometry({ ...g, view: { x: x / o.width, y: y / o.height, zoom } }, source, out);
}

/** Placement des modes « Entière » : toute la photo (inclinée) visible, centrée. */
export function containPlacement(source: Size, g: Geometry, out: Size): Placement {
  const o = orientedSize(source, g.turns);
  const angle = clampStraighten(g.straighten);
  const c = Math.abs(Math.cos(angle * RAD));
  const s = Math.abs(Math.sin(angle * RAD));
  const boxWidth = c * o.width + s * o.height;
  const boxHeight = s * o.width + c * o.height;
  return { cx: o.width / 2, cy: o.height / 2, scale: Math.min(out.width / boxWidth, out.height / boxHeight), angle };
}

/** La copie agrandie du mode « bords flous » déborde de la sortie : le flou ne pâlit pas les bords. */
export const BACKDROP_ZOOM = 1.25;

/** Placement de la copie agrandie (couvre toute la sortie, même inclinée). */
export function backdropPlacement(source: Size, g: Geometry, out: Size): Placement {
  const o = orientedSize(source, g.turns);
  const angle = clampStraighten(g.straighten);
  return { cx: o.width / 2, cy: o.height / 2, scale: coverScale(o, out, angle) * BACKDROP_ZOOM, angle };
}

/** Vrai si la photo est tournée, retournée ou redressée (hors simple choix de la zone). */
export function isReoriented(g: Geometry | undefined): boolean {
  return !!g && (g.turns !== 0 || g.mirror || g.straighten !== 0);
}
