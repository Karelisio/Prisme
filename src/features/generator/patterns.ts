// Motifs vectoriels du générateur : toute la géométrie est calculée ici, sans toucher au DOM.
// Chaque motif produit une « scène » (liste de formes en pixels) que `drawScene` trace sur un
// canevas, à n'importe quelle taille : le rendu reste net, et l'aperçu a la même composition
// que l'export puisque tout est proportionnel à la largeur.

import { type Lab, type Palette6, completePalette, hexToOklab, makeLabRamp, mixHex, oklabToHex, shiftLightness, spreadLightness } from './color';
import { cellRandom, mulberry32, shuffled } from './random';

export const PATTERN_KINDS = ['geometric', 'dots', 'wavy', 'bauhaus', 'stripes', 'terrazzo', 'isometric'] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export type GeometricShape = 'triangles' | 'hexagons' | 'diamonds';
/** Libellés en français (données) : `t(label)` à l'affichage. */
export const GEOMETRIC_SHAPES: readonly { value: GeometricShape; label: string }[] = [
  { value: 'triangles', label: 'Triangles' },
  { value: 'hexagons', label: 'Hexagones' },
  { value: 'diamonds', label: 'Losanges' },
];

export interface PatternOptions {
  /** 0 = grands motifs, 1 = motifs fins. */
  scale: number;
  /** 0 à 1 : écart entre tuiles, taille des pois, épaisseur des traits ou densité selon le motif. */
  thickness: number;
  /** Rotation du motif autour du centre de l'écran, en degrés. */
  rotation: number;
  /** Forme des tuiles du motif géométrique. */
  shape: GeometricShape;
  seed: number;
}

export type Shape =
  | { type: 'poly'; points: number[]; fill: string; bleed: boolean }
  | { type: 'circle'; x: number; y: number; r: number; fill: string }
  | { type: 'sector'; x: number; y: number; r: number; start: number; end: number; fill: string; bleed: boolean }
  | { type: 'line'; points: number[]; width: number; stroke: string };

export interface Scene {
  background: string;
  shapes: Shape[];
  /** Largeur (px) du liseré de même couleur qui masque les coutures entre formes voisines. */
  bleed: number;
}

const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolation géométrique : t = 0,5 donne la moyenne géométrique de a et b. */
const lerpExp = (a: number, b: number, t: number) => a * (b / a) ** t;
/** Liseré de recouvrement : environ un pixel d'export, jamais moins d'un pixel. */
const bleedFor = (width: number) => Math.max(1, width / 1080);

// --- Repère tourné ----------------------------------------------------------------------------

/** Repère local (u, v) centré sur l'écran et tourné de `rotation` : les motifs y sont droits. */
interface Frame {
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  /** Étendue locale qui recouvre tout l'écran. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

function makeFrame(width: number, height: number, degrees: number): Frame {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = width / 2;
  const cy = height / 2;
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const [x, y] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const) {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  return { cx, cy, cos, sin, u0, u1, v0, v1 };
}

const toX = (f: Frame, u: number, v: number) => f.cx + u * f.cos - v * f.sin;
const toY = (f: Frame, u: number, v: number) => f.cy + u * f.sin + v * f.cos;

/** Forme qui sort de l'écran : inutile de la tracer (marge proportionnelle, pour garder la même composition à toute taille). */
function offscreen(minX: number, minY: number, maxX: number, maxY: number, width: number, height: number): boolean {
  const margin = width * 0.002;
  return maxX < -margin || minX > width + margin || maxY < -margin || minY > height + margin;
}

/** Ajoute un polygone donné en coordonnées locales (u0, v0, u1, v1, ...), s'il est visible. */
function addPoly(out: Shape[], f: Frame, width: number, height: number, local: readonly number[], fill: string, bleed: boolean) {
  const points: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < local.length; k += 2) {
    const x = toX(f, local[k] as number, local[k + 1] as number);
    const y = toY(f, local[k] as number, local[k + 1] as number);
    points.push(x, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!offscreen(minX, minY, maxX, maxY, width, height)) out.push({ type: 'poly', points, fill, bleed });
}

function centroid(local: readonly number[]): [number, number] {
  let cu = 0;
  let cv = 0;
  for (let k = 0; k < local.length; k += 2) {
    cu += local[k] as number;
    cv += local[k + 1] as number;
  }
  return [cu / (local.length / 2), cv / (local.length / 2)];
}

/** Polygone dont les sommets sont rapprochés de leur centre (jointure visible entre tuiles). */
function shrink(local: readonly number[], factor: number): number[] {
  const [cu, cv] = centroid(local);
  return local.map((value, k) => {
    const center = k % 2 === 0 ? cu : cv;
    return center + (value - center) * factor;
  });
}

function sixColors(palette: readonly string[]): Palette6 {
  return completePalette(palette.slice(0, 3), palette.slice(3));
}

// --- Géométrique : triangles, hexagones, losanges --------------------------------------------

function buildGeometric(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, c2, a0, a1, a2] = pal;
  const f = makeFrame(width, height, o.rotation);
  const shapes: Shape[] = [];
  const base = makeLabRamp([c0, c1]);
  const sparks = [a0, a1, a2].map(hexToOklab);
  // Un dégradé de tons traverse l'écran dans une direction tirée de la graine ; chaque tuile y ajoute une variation.
  const theta = ((60 + cellRandom(o.seed, 11, 13, 1) * 60) * Math.PI) / 180;
  const gx = Math.cos(theta);
  const gy = Math.sin(theta);
  const extent = Math.abs(gx) * width + Math.abs(gy) * height;
  const inset = 1 - 0.34 * o.thickness;
  const seamless = inset >= 0.999;

  const tile = (local: number[], i: number, j: number, salt: number) => {
    const [cu, cv] = centroid(local);
    const g = ((toX(f, cu, cv) - f.cx) * gx + (toY(f, cu, cv) - f.cy) * gy) / extent + 0.5;
    const t = clamp01(g * 1.15 - 0.075 + (cellRandom(o.seed, i, j, salt) - 0.5) * 0.5);
    const lab: Lab = base(t);
    // Quelques tuiles prennent une teinte d'appoint, adoucie par le ton du dégradé.
    if (cellRandom(o.seed, i, j, salt + 1) < 0.06) {
      const spark = sparks[Math.floor(cellRandom(o.seed, i, j, salt + 3) * sparks.length)] as Lab;
      lab[0] += (spark[0] - lab[0]) * 0.6;
      lab[1] += (spark[1] - lab[1]) * 0.6;
      lab[2] += (spark[2] - lab[2]) * 0.6;
    }
    lab[0] += (cellRandom(o.seed, i, j, salt + 2) - 0.5) * 0.05;
    addPoly(shapes, f, width, height, seamless ? local : shrink(local, inset), oklabToHex(lab), seamless);
  };

  if (o.shape === 'triangles') {
    const a = width / lerpExp(3, 14, o.scale);
    const h = (a * SQRT3) / 2;
    for (let j = Math.floor(f.v0 / h) - 1; j <= Math.ceil(f.v1 / h) + 1; j++) {
      const shift = (j * a) / 2;
      for (let i = Math.floor((f.u0 - shift) / a) - 1; i <= Math.ceil((f.u1 - shift) / a) + 1; i++) {
        const x = i * a + shift;
        const y = j * h;
        // Deux triangles par maille du réseau : un pointe vers le bas, l'autre vers le haut.
        tile([x, y, x + a, y, x + a / 2, y + h], i, j, 0);
        tile([x + a, y, x + a * 1.5, y + h, x + a / 2, y + h], i, j, 10);
      }
    }
  } else if (o.shape === 'hexagons') {
    const w = width / lerpExp(2, 8, o.scale);
    const r = w / SQRT3;
    for (let q = Math.floor(f.v0 / (1.5 * r)) - 1; q <= Math.ceil(f.v1 / (1.5 * r)) + 1; q++) {
      for (let i = Math.floor(f.u0 / w - q / 2) - 1; i <= Math.ceil(f.u1 / w - q / 2) + 1; i++) {
        const cu = w * (i + q / 2);
        const cv = 1.5 * r * q;
        const local: number[] = [];
        for (let k = 0; k < 6; k++) {
          const angle = ((60 * k - 30) * Math.PI) / 180;
          local.push(cu + r * Math.cos(angle), cv + r * Math.sin(angle));
        }
        tile(local, i, q, 0);
      }
    }
  } else {
    const a = width / lerpExp(2.5, 10, o.scale);
    const half = (a * SQRT3) / 2;
    for (let j = Math.floor(f.v0 / half) - 1; j <= Math.ceil(f.v1 / half) + 1; j++) {
      const parity = ((j % 2) + 2) % 2;
      for (let i = Math.floor(f.u0 / a - parity / 2) - 1; i <= Math.ceil(f.u1 / a - parity / 2) + 1; i++) {
        const cu = a * (i + parity / 2);
        const cv = half * j;
        tile([cu - a / 2, cv, cu, cv - half, cu + a / 2, cv, cu, cv + half], i, j, 0);
      }
    }
  }
  return { background: mixHex(c0, c2, 0.22), shapes, bleed: bleedFor(width) };
}

// --- Pois -------------------------------------------------------------------------------------

function buildDots(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, , a0, a1] = pal;
  const f = makeFrame(width, height, o.rotation);
  const shapes: Shape[] = [];
  const pitch = width / lerpExp(4, 18, o.scale);
  const big = pitch * lerp(0.13, 0.45, o.thickness);
  // Les petits pois se logent au centre de chaque maille, sans toucher les grands.
  const small = Math.max(0, Math.min(big * 0.45, pitch * (Math.SQRT1_2 - 0.07) - big));
  const smallColor = mixHex(c0, a1, 0.55);
  const margin = pitch;

  const dot = (u: number, v: number, r: number, fill: string) => {
    const x = toX(f, u, v);
    const y = toY(f, u, v);
    if (!offscreen(x - r, y - r, x + r, y + r, width, height)) shapes.push({ type: 'circle', x, y, r, fill });
  };

  for (let j = Math.floor((f.v0 - margin) / pitch); j <= Math.ceil((f.v1 + margin) / pitch); j++) {
    for (let i = Math.floor((f.u0 - margin) / pitch); i <= Math.ceil((f.u1 + margin) / pitch); i++) {
      const pick = cellRandom(o.seed, i, j, 1);
      dot(i * pitch, j * pitch, big, pick < 0.8 ? c1 : pick < 0.9 ? a0 : a1);
      if (small > 0.5) dot((i + 0.5) * pitch, (j + 0.5) * pitch, small, smallColor);
    }
  }
  return { background: c0, shapes, bleed: 0 };
}

// --- Vagues : lignes ondulées répétées --------------------------------------------------------

function buildWavy(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, , a0] = pal;
  const f = makeFrame(width, height, o.rotation);
  const shapes: Shape[] = [];
  const pitch = width / lerpExp(6, 30, o.scale);
  const lineWidth = pitch * lerp(0.12, 0.6, o.thickness);
  const r = (k: number) => cellRandom(o.seed, k, 0, 21);
  const lambda = pitch * (6 + 4 * r(1));
  const amp = pitch * (0.34 + 0.3 * r(2));
  const period = 5 + 4 * r(4);
  // Les lignes voisines ne doivent jamais se toucher : on borne la modulation d'amplitude et le déphasage.
  const budget = Math.max(0.05 * pitch, pitch - lineWidth) * 0.8;
  const diffRate = (TAU / period) * amp;
  const depth = Math.min(0.22 * r(3), (budget * 0.5) / Math.max(1e-6, diffRate));
  const rest = budget - depth * diffRate;
  const shift = Math.min(0.12 + 0.4 * r(7), 2 * Math.asin(Math.min(1, rest / (2 * amp * (1 + depth)))));
  const phase = TAU * r(5);
  const modPhase = TAU * r(6);
  // Les lignes passent de l'accent doux à une teinte d'appoint d'un bout à l'autre de l'écran.
  const ramp = makeLabRamp([c1, a0]);
  const step = lambda / 56;
  const first = Math.floor((f.v0 - amp * 2) / pitch) - 1;
  const last = Math.ceil((f.v1 + amp * 2) / pitch) + 1;

  for (let j = first; j <= last; j++) {
    const a = amp * (1 + depth * Math.sin((TAU * j) / period + modPhase));
    const phi = phase + j * shift;
    const points: number[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let u = f.u0 - lambda; u <= f.u1 + lambda + step; u += step) {
      const v = j * pitch + a * Math.sin((TAU * u) / lambda + phi);
      const x = toX(f, u, v);
      const y = toY(f, u, v);
      points.push(x, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (offscreen(minX - lineWidth, minY - lineWidth, maxX + lineWidth, maxY + lineWidth, width, height)) continue;
    const t = clamp01((j * pitch - f.v0) / (f.v1 - f.v0));
    shapes.push({ type: 'line', points, width: lineWidth, stroke: oklabToHex(ramp(t)) });
  }
  return { background: c0, shapes, bleed: 0 };
}

// --- Rayures ----------------------------------------------------------------------------------

function buildStripes(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, , a0, a1, a2] = pal;
  const f = makeFrame(width, height, o.rotation);
  const shapes: Shape[] = [];
  const random = mulberry32((o.seed ^ 0x51ed27) >>> 0);
  const period = width / lerpExp(2.5, 14, o.scale);
  const coverage = lerp(0.2, 0.85, o.thickness);
  // Chaque période répète la même suite de 1 à 3 bandes, de largeurs et de couleurs tirées de la graine.
  const count = 1 + Math.floor(random() * 3);
  const weights = Array.from({ length: count }, () => 0.55 + random());
  const total = weights.reduce((sum, w) => sum + w, 0);
  const inks = shuffled([c1, a0, a1, a2], random);
  const gap = ((1 - coverage) * period) / count;
  const pad = width * 0.002;

  for (let n = Math.floor(f.u0 / period) - 1; n <= Math.ceil(f.u1 / period) + 1; n++) {
    let u = n * period + gap / 2;
    for (let k = 0; k < count; k++) {
      const w = (coverage * period * (weights[k] as number)) / total;
      addPoly(shapes, f, width, height, [u, f.v0 - pad, u + w, f.v0 - pad, u + w, f.v1 + pad, u, f.v1 + pad], inks[k] as string, false);
      u += w + gap;
    }
  }
  return { background: c0, shapes, bleed: 0 };
}

// --- Bauhaus ----------------------------------------------------------------------------------

type BauhausModule = 'circle' | 'disc' | 'half' | 'quarter' | 'ring' | 'bars' | 'diamond' | 'triangle';
const BAUHAUS_MODULES: readonly BauhausModule[] = ['circle', 'disc', 'half', 'quarter', 'ring', 'bars', 'diamond', 'triangle'];
/** Formes dont la taille ou le trait suit le réglage d'épaisseur : une composition en contient toujours une. */
const BAUHAUS_WEIGHTED: readonly BauhausModule[] = ['circle', 'ring', 'bars', 'diamond'];

function buildBauhaus(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, c2, a0, a1, a2] = pal;
  const backgrounds: Shape[] = [];
  const foregrounds: Shape[] = [];
  const random = mulberry32((o.seed ^ 0xba0ba5) >>> 0);
  const cols = Math.max(2, Math.round(lerpExp(2.5, 7.4, o.scale)));
  const s = width / cols;
  const rows = Math.ceil(height / s) + 1;
  const top = (height - rows * s) / 2;
  // Une composition = un petit vocabulaire de formes et de couleurs, pour rester cohérente.
  const modules = shuffled(BAUHAUS_MODULES, random).slice(0, 4);
  if (!modules.some((m) => BAUHAUS_WEIGHTED.includes(m))) modules[3] = BAUHAUS_WEIGHTED[Math.floor(random() * BAUHAUS_WEIGHTED.length)] as BauhausModule;
  const backs = [c0, mixHex(c0, c1, 0.5)];
  // Les grands aplats restent dans les tons d'accompagnement ; la couleur de contraste ne sert qu'aux petites formes.
  const inks = shuffled([c1, a0, a1, a2], random).slice(0, 3);
  const dotRadius = s * lerp(0.26, 0.46, o.thickness);
  const diamondRadius = s * lerp(0.3, 0.5, o.thickness);
  const bar = s * lerp(0.07, 0.2, o.thickness);
  const ringWidth = s * lerp(0.07, 0.17, o.thickness);
  const lightOf = (hex: string) => hexToOklab(hex)[0];

  // Un aplat de couleur différente de celle du fond de la cellule, sinon la forme serait invisible.
  const contrasting = (back: string, wanted: number): string => {
    for (let k = 0; k < inks.length; k++) {
      const ink = inks[(wanted + k) % inks.length] as string;
      if (Math.abs(lightOf(ink) - lightOf(back)) > 0.04) return ink;
    }
    return c2;
  };
  const poly = (points: number[], fill: string) => foregrounds.push({ type: 'poly', points, fill, bleed: true });
  const sector = (x: number, y: number, r: number, start: number, end: number, fill: string) =>
    foregrounds.push({ type: 'sector', x, y, r, start, end, fill, bleed: true });
  const disc = (x: number, y: number, r: number, fill: string) => foregrounds.push({ type: 'circle', x, y, r, fill });

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * s;
      const y = top + j * s;
      const pick = (salt: number, n: number) => Math.floor(cellRandom(o.seed, i, j, salt) * n);
      const back = backs[cellRandom(o.seed, i, j, 1) < 0.72 ? 0 : 1] as string;
      backgrounds.push({ type: 'poly', points: [x, y, x + s, y, x + s, y + s, x, y + s], fill: back, bleed: true });
      const kind = cellRandom(o.seed, i, j, 2) < 0.1 ? null : (modules[pick(3, modules.length)] as BauhausModule);
      const accent = (kind === 'circle' || kind === 'diamond' || kind === 'bars') && cellRandom(o.seed, i, j, 7) < 0.4 && Math.abs(lightOf(c2) - lightOf(back)) > 0.2;
      const ink = accent ? c2 : contrasting(back, pick(4, inks.length));
      const ink2 = contrasting(ink, pick(5, inks.length) + 1);
      const o4 = pick(6, 4);
      const cx = x + s / 2;
      const cy = y + s / 2;
      switch (kind) {
        case 'circle':
          disc(cx, cy, dotRadius, ink);
          break;
        case 'disc':
          disc(cx, cy, s / 2, ink);
          break;
        case 'half': {
          const centers: [number, number][] = [
            [cx, y + s],
            [x, cy],
            [cx, y],
            [x + s, cy],
          ];
          const [hx, hy] = centers[o4] as [number, number];
          sector(hx, hy, s / 2, (o4 * Math.PI) / 2 + Math.PI, (o4 * Math.PI) / 2 + TAU, ink);
          break;
        }
        case 'quarter': {
          const corners: [number, number][] = [
            [x, y],
            [x + s, y],
            [x + s, y + s],
            [x, y + s],
          ];
          const [qx, qy] = corners[o4] as [number, number];
          sector(qx, qy, s, (o4 * Math.PI) / 2, ((o4 + 1) * Math.PI) / 2, ink);
          break;
        }
        case 'ring':
          disc(cx, cy, s / 2, ink);
          disc(cx, cy, s / 2 - ringWidth, back);
          disc(cx, cy, Math.max(s * 0.1, s / 2 - ringWidth * 2.4), ink2);
          break;
        case 'bars': {
          const count = 3;
          const w = Math.min(bar, (s / count) * 0.85);
          for (let k = 0; k < count; k++) {
            const c = (k + 0.5) * (s / count);
            if (o4 % 2 === 0) poly([x + c - w / 2, y, x + c + w / 2, y, x + c + w / 2, y + s, x + c - w / 2, y + s], ink);
            else poly([x, y + c - w / 2, x + s, y + c - w / 2, x + s, y + c + w / 2, x, y + c + w / 2], ink);
          }
          break;
        }
        case 'diamond':
          poly([cx, cy - diamondRadius, cx + diamondRadius, cy, cx, cy + diamondRadius, cx - diamondRadius, cy], ink);
          break;
        case 'triangle': {
          const tri = [
            [x, y, x + s, y, x, y + s],
            [x, y, x + s, y, x + s, y + s],
            [x + s, y, x + s, y + s, x, y + s],
            [x, y, x + s, y + s, x, y + s],
          ] as const;
          poly([...(tri[o4] as readonly number[])], ink);
          break;
        }
        default:
          break;
      }
    }
  }
  // Tous les fonds d'abord : le liseré d'une cellule ne mord jamais sur les formes d'une voisine.
  return { background: c0, shapes: [...backgrounds, ...foregrounds], bleed: bleedFor(width) };
}

// --- Terrazzo ---------------------------------------------------------------------------------

function buildTerrazzo(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, c2, a0, a1, a2] = pal;
  const shapes: Shape[] = [];
  const random = mulberry32((o.seed ^ 0x7e22a1) >>> 0);
  const r0 = width * lerpExp(0.085, 0.024, o.scale);
  const cover = lerp(0.14, 0.46, o.thickness);
  const count = Math.min(2500, Math.round((cover * width * height) / (1.1 * r0 * r0)));
  // Beaucoup de petits éclats, quelques grands : on place les grands d'abord, les petits comblent les vides.
  const radii = Array.from({ length: count }, () => r0 * (0.3 + 1.5 * random() ** 3)).sort((a, b) => b - a);
  const gap = r0 * 0.28;
  const cellSize = (radii[0] ?? r0) * 2 + gap;
  const grid = new Map<number, [number, number, number][]>();
  const key = (gx: number, gy: number) => gx * 73856093 + gy * 19349663;
  const margin = r0 * 0.5;
  // La couleur de contraste reste rare : quelques éclats sombres suffisent à donner du relief.
  const soft = mixHex(c0, c1, 0.5);
  const inks = [c1, c1, c1, a0, a0, a1, a1, a2, a2, soft, soft, soft, c2];

  for (const r of radii) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const x = lerp(-margin, width + margin, random());
      const y = lerp(-margin, height + margin, random());
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      let free = true;
      for (let dy = -1; dy <= 1 && free; dy++) {
        for (let dx = -1; dx <= 1 && free; dx++) {
          for (const [ox, oy, other] of grid.get(key(gx + dx, gy + dy)) ?? []) {
            if (Math.hypot(ox - x, oy - y) < r + other + gap) {
              free = false;
              break;
            }
          }
        }
      }
      if (!free) continue;
      const cell = grid.get(key(gx, gy));
      if (cell) cell.push([x, y, r]);
      else grid.set(key(gx, gy), [[x, y, r]]);
      // Éclat irrégulier : 5 à 7 sommets, rayons inégaux, légèrement aplati puis tourné.
      const n = 5 + Math.floor(random() * 3);
      const rotation = random() * TAU;
      const squash = 0.62 + random() * 0.38;
      const points: number[] = [];
      for (let k = 0; k < n; k++) {
        const angle = ((k + (random() - 0.5) * 0.6) / n) * TAU;
        const radius = r * (0.66 + random() * 0.34);
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius * squash;
        points.push(x + px * Math.cos(rotation) - py * Math.sin(rotation), y + px * Math.sin(rotation) + py * Math.cos(rotation));
      }
      shapes.push({ type: 'poly', points, fill: inks[Math.floor(random() * inks.length)] as string, bleed: false });
      break;
    }
  }
  return { background: c0, shapes, bleed: 0 };
}

// --- Grille isométrique -----------------------------------------------------------------------

function buildIsometric(pal: Palette6, o: PatternOptions, width: number, height: number): Scene {
  const [c0, c1, c2] = pal;
  const f = makeFrame(width, height, o.rotation);
  const shapes: Shape[] = [];
  // Trois tons de lumière : dessus clair, côté moyen, côté sombre, quel que soit l'ordre de la palette.
  const [light, mid, dark] = spreadLightness([c0, c1, mixHex(c0, c2, 0.3)], 0.07) as [string, string, string];
  const faces = [light, dark, mid];
  const w = width / lerpExp(2.5, 10, o.scale);
  const r = w / SQRT3;
  const inset = 1 - 0.3 * o.thickness;
  const seamless = inset >= 0.999;

  for (let q = Math.floor(f.v0 / (1.5 * r)) - 1; q <= Math.ceil(f.v1 / (1.5 * r)) + 1; q++) {
    for (let i = Math.floor(f.u0 / w - q / 2) - 1; i <= Math.ceil(f.u1 / w - q / 2) + 1; i++) {
      const cu = w * (i + q / 2);
      const cv = 1.5 * r * q;
      const v: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const angle = ((60 * k - 90) * Math.PI) / 180;
        v.push([cu + r * Math.cos(angle), cv + r * Math.sin(angle)]);
      }
      // Une part des cubes est pivotée : l'empilement n'est plus uniforme, la graine fait varier la grille.
      const turn = cellRandom(o.seed, i, q, 1) < 0.22 ? 1 + Math.floor(cellRandom(o.seed, i, q, 2) * 2) : 0;
      const rhombi = [
        [cu, cv, ...(v[5] as [number, number]), ...(v[0] as [number, number]), ...(v[1] as [number, number])],
        [cu, cv, ...(v[1] as [number, number]), ...(v[2] as [number, number]), ...(v[3] as [number, number])],
        [cu, cv, ...(v[3] as [number, number]), ...(v[4] as [number, number]), ...(v[5] as [number, number])],
      ];
      rhombi.forEach((local, k) => {
        addPoly(shapes, f, width, height, seamless ? local : shrink(local, inset), faces[(k + turn) % 3] as string, seamless);
      });
    }
  }
  return { background: shiftLightness(dark, -0.05), shapes, bleed: bleedFor(width) };
}

// --- Point d'entrée ---------------------------------------------------------------------------

const BUILDERS: Record<PatternKind, (pal: Palette6, o: PatternOptions, w: number, h: number) => Scene> = {
  geometric: buildGeometric,
  dots: buildDots,
  wavy: buildWavy,
  bauhaus: buildBauhaus,
  stripes: buildStripes,
  terrazzo: buildTerrazzo,
  isometric: buildIsometric,
};

/** Calcule la scène d'un motif pour une taille donnée ; même entrée, même scène. */
export function buildPattern(kind: PatternKind, palette: readonly string[], options: PatternOptions, width: number, height: number): Scene {
  const o: PatternOptions = { ...options, scale: clamp01(options.scale), thickness: clamp01(options.thickness) };
  return BUILDERS[kind](sixColors(palette), o, width, height);
}

function tracePolyline(ctx: CanvasRenderingContext2D, p: readonly number[]) {
  ctx.moveTo(p[0] as number, p[1] as number);
  for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k] as number, p[k + 1] as number);
}

/** Trace une scène sur un canevas (le fond d'abord, puis les formes dans l'ordre). */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, width, height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const shape of scene.shapes) {
    switch (shape.type) {
      case 'poly':
        ctx.beginPath();
        tracePolyline(ctx, shape.points);
        ctx.closePath();
        ctx.fillStyle = shape.fill;
        ctx.fill();
        if (shape.bleed && scene.bleed > 0) {
          ctx.strokeStyle = shape.fill;
          ctx.lineWidth = scene.bleed;
          ctx.stroke();
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.r, 0, TAU);
        ctx.fillStyle = shape.fill;
        ctx.fill();
        break;
      case 'sector':
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.arc(shape.x, shape.y, shape.r, shape.start, shape.end);
        ctx.closePath();
        ctx.fillStyle = shape.fill;
        ctx.fill();
        if (shape.bleed && scene.bleed > 0) {
          ctx.strokeStyle = shape.fill;
          ctx.lineWidth = scene.bleed;
          ctx.stroke();
        }
        break;
      case 'line':
        ctx.beginPath();
        tracePolyline(ctx, shape.points);
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.width;
        ctx.stroke();
        break;
    }
  }
  ctx.restore();
}
