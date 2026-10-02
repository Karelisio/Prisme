import { type RGB, clamp01, lerp } from './color';
import { nearestColor, quantize } from './quantize';

/**
 * Effets artistiques : calculs purs sur des pixels RGBA, écrits comme des générateurs qui cèdent la
 * main régulièrement (`yield`). `drain` les exécute d'une traite ; `drainAsync` les découpe en tranches
 * pour ne jamais geler l'interface. Les tailles sont exprimées en nombre de cellules sur la largeur :
 * aperçu réduit et export à la taille de l'écran donnent la même composition, à des résolutions
 * différentes.
 */

export type EffectKind = 'none' | 'pixel' | 'mosaic' | 'halftone' | 'paint';

export interface EffectParams {
  kind: EffectKind;
  /** 0..1 : taille des pixels, des tesselles ou de la trame ; intensité de la peinture. */
  amount: number;
}

export const DEFAULT_EFFECT: EffectParams = { kind: 'none', amount: 0.5 };

/** Libellés en français : traduits à l'affichage (`t`). */
export const EFFECTS: readonly { kind: EffectKind; label: string; control: string }[] = [
  { kind: 'none', label: 'Aucun', control: '' },
  { kind: 'pixel', label: 'Pixel art', control: 'Taille des pixels' },
  { kind: 'mosaic', label: 'Mosaïque', control: 'Taille des tesselles' },
  { kind: 'halftone', label: 'Trame', control: 'Taille de la trame' },
  { kind: 'paint', label: 'Peinture', control: 'Intensité de la peinture' },
];

export const isEffectActive = (e: EffectParams) => e.kind !== 'none';

/** Les blocs nets (pixels, tesselles) restent nets quand l'aperçu basse résolution est agrandi. */
export const UPSCALE_SMOOTH: Record<EffectKind, boolean> = { none: true, pixel: false, mosaic: false, halftone: true, paint: true };

export interface Pixels {
  /** RGBA, 4 octets par pixel. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type Steps<T> = Generator<void, T, undefined>;

/** Exécute un traitement fractionné d'une traite. */
export function drain<T>(steps: Steps<T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Exécute un traitement fractionné par tranches de `budgetMs` : entre deux tranches, le navigateur
 * peut afficher et traiter les gestes. Renvoie null si `signal` est annulé en cours de route.
 */
export async function drainAsync<T>(steps: Steps<T>, signal?: AbortSignal, budgetMs = 8): Promise<{ value: T } | null> {
  let sliceStart = performance.now();
  for (;;) {
    if (signal?.aborted) {
      steps.return(undefined as T);
      return null;
    }
    const step = steps.next();
    if (step.done) return { value: step.value };
    if (performance.now() - sliceStart >= budgetMs) {
      await nextTask();
      sliceStart = performance.now();
    }
  }
}

/* ---------- Grille de cellules ---------- */

export interface Grid {
  cols: number;
  rows: number;
  /** Limites des colonnes (cols + 1 valeurs, de 0 à la largeur). */
  xs: Int32Array;
  /** Limites des lignes (rows + 1 valeurs, de 0 à la hauteur). */
  ys: Int32Array;
}

/** Grille de cellules carrées : `cols` colonnes sur la largeur, autant de lignes que la hauteur en demande. */
export function makeGrid(width: number, height: number, cols: number): Grid {
  const count = Math.max(1, Math.min(Math.round(cols), width));
  const cell = width / count;
  const rows = Math.max(1, Math.min(height, Math.ceil(height / cell - 1e-9)));
  const xs = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) xs[i] = Math.round(i * cell);
  xs[count] = width;
  const ys = new Int32Array(rows + 1);
  for (let j = 0; j < rows; j++) ys[j] = Math.min(height, Math.round(j * cell));
  ys[rows] = height;
  return { cols: count, rows, xs, ys };
}

/** Couleur moyenne de chaque cellule (triplets RGB à plat, ligne par ligne). */
function* cellAverages(src: Pixels, grid: Grid): Steps<Float32Array> {
  const { cols, rows, xs, ys } = grid;
  const { data, width } = src;
  const out = new Float32Array(cols * rows * 3);
  const sum = new Float64Array(cols * 3);
  for (let j = 0; j < rows; j++) {
    sum.fill(0);
    const y0 = ys[j]!;
    const y1 = ys[j + 1]!;
    for (let y = y0; y < y1; y++) {
      let p = y * width * 4;
      let cell = 0;
      let edge = xs[1]!;
      for (let x = 0; x < width; x++, p += 4) {
        while (x >= edge) edge = xs[++cell + 1]!;
        const s = cell * 3;
        sum[s] = sum[s]! + data[p]!;
        sum[s + 1] = sum[s + 1]! + data[p + 1]!;
        sum[s + 2] = sum[s + 2]! + data[p + 2]!;
      }
    }
    for (let i = 0; i < cols; i++) {
      const area = (y1 - y0) * (xs[i + 1]! - xs[i]!);
      const o = (j * cols + i) * 3;
      if (area > 0) {
        out[o] = sum[i * 3]! / area;
        out[o + 1] = sum[i * 3 + 1]! / area;
        out[o + 2] = sum[i * 3 + 2]! / area;
      }
    }
    yield;
  }
  return out;
}

function fillRect(out: Uint8ClampedArray, width: number, x0: number, x1: number, y0: number, y1: number, r: number, g: number, b: number) {
  for (let y = y0; y < y1; y++) {
    let p = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, p += 4) {
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = 255;
    }
  }
}

/* ---------- Pixel art ---------- */

const PIXEL_COLS_FINE = 180;
const PIXEL_COLS_COARSE = 28;
export const PIXEL_PALETTE_SIZE = 16;

/** Pixellisation puis palette réduite : les couleurs de la photo sont ramenées à PIXEL_PALETTE_SIZE teintes. */
export function* pixelArt(src: Pixels, amount: number): Steps<Pixels> {
  const { width, height } = src;
  const grid = makeGrid(width, height, lerp(PIXEL_COLS_FINE, PIXEL_COLS_COARSE, clamp01(amount)));
  const averages = yield* cellAverages(src, grid);
  const palette = quantize(averages, PIXEL_PALETTE_SIZE).map((c) => c.color);
  const out = new Uint8ClampedArray(src.data.length);
  // Les couleurs voisines (15 bits) partagent leur correspondance dans la palette.
  const lookup = new Int16Array(32768).fill(-1);
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const o = (j * grid.cols + i) * 3;
      const r = averages[o]!;
      const g = averages[o + 1]!;
      const b = averages[o + 2]!;
      const key = ((Math.round(r) >> 3) << 10) | ((Math.round(g) >> 3) << 5) | (Math.round(b) >> 3);
      let index = lookup[key]!;
      if (index < 0) {
        index = nearestColor(palette, r, g, b);
        lookup[key] = index;
      }
      const c: RGB = palette[index] ?? [r, g, b];
      fillRect(out, width, grid.xs[i]!, grid.xs[i + 1]!, grid.ys[j]!, grid.ys[j + 1]!, c[0], c[1], c[2]);
    }
    yield;
  }
  return { data: out, width, height };
}

/* ---------- Mosaïque ---------- */

const MOSAIC_COLS_FINE = 90;
const MOSAIC_COLS_COARSE = 14;
/** Largeur des joints, en proportion de la tesselle. */
const MOSAIC_JOINT = 0.13;
/** Écart de luminosité d'une tesselle à l'autre (± la moitié). */
export const MOSAIC_JITTER = 0.16;
/** Joints : la couleur moyenne de la photo, très assombrie. */
const GROUT_DARKNESS = 0.28;

/** Nombre pseudo-aléatoire stable (0 ≤ n < 1) pour la cellule (i, j) : aperçu et export tirent les mêmes teintes. */
export function cellNoise(i: number, j: number): number {
  let h = Math.imul(i + 1, 0x27d4eb2d) ^ Math.imul(j + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Mosaïque : tesselles carrées de la couleur moyenne de la zone, légèrement irrégulières, séparées par des joints. */
export function* mosaic(src: Pixels, amount: number): Steps<Pixels> {
  const { width, height } = src;
  const grid = makeGrid(width, height, lerp(MOSAIC_COLS_FINE, MOSAIC_COLS_COARSE, clamp01(amount)));
  const averages = yield* cellAverages(src, grid);
  const cells = grid.cols * grid.rows;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let c = 0; c < cells; c++) {
    mr += averages[c * 3]!;
    mg += averages[c * 3 + 1]!;
    mb += averages[c * 3 + 2]!;
  }
  const groutR = (mr / cells) * GROUT_DARKNESS;
  const groutG = (mg / cells) * GROUT_DARKNESS;
  const groutB = (mb / cells) * GROUT_DARKNESS;

  const out = new Uint8ClampedArray(src.data.length);
  for (let j = 0; j < grid.rows; j++) {
    const y0 = grid.ys[j]!;
    const th = grid.ys[j + 1]! - y0;
    for (let i = 0; i < grid.cols; i++) {
      const x0 = grid.xs[i]!;
      const tw = grid.xs[i + 1]! - x0;
      const joint = Math.max(1, Math.round(Math.min(tw, th) * MOSAIC_JOINT));
      const before = joint >> 1;
      const after = joint - before;
      const bevel = Math.max(1, Math.round(joint * 0.7));
      const o = (j * grid.cols + i) * 3;
      const jitter = 1 + (cellNoise(i, j) - 0.5) * MOSAIC_JITTER;
      const r = averages[o]! * jitter;
      const g = averages[o + 1]! * jitter;
      const b = averages[o + 2]! * jitter;
      for (let y = 0; y < th; y++) {
        let p = ((y0 + y) * width + x0) * 4;
        for (let x = 0; x < tw; x++, p += 4) {
          out[p + 3] = 255;
          if (x < before || x >= tw - after || y < before || y >= th - after) {
            out[p] = groutR;
            out[p + 1] = groutG;
            out[p + 2] = groutB;
            continue;
          }
          // Léger biseau : bord haut et gauche éclairés, bas et droit dans l'ombre.
          const shade = x < before + bevel || y < before + bevel ? 1.1 : x >= tw - after - bevel || y >= th - after - bevel ? 0.9 : 1;
          out[p] = r * shade;
          out[p + 1] = g * shade;
          out[p + 2] = b * shade;
        }
      }
    }
    yield;
  }
  return { data: out, width, height };
}

/* ---------- Trame (demi-teintes) ---------- */

const HALFTONE_COLS_FINE = 110;
const HALFTONE_COLS_COARSE = 20;
const HALFTONE_BACKGROUND = [10, 10, 12] as const;
/** Rayon d'un point qui couvre toute sa cellule carrée (demi-diagonale), en cellules. */
const FULL_RADIUS = Math.SQRT1_2;

/** Part de la cellule carrée (côté 1) recouverte par un disque de rayon `radius` centré dans la cellule. */
export function coverageOfRadius(radius: number): number {
  if (radius <= 0) return 0;
  if (radius <= 0.5) return Math.PI * radius * radius;
  if (radius >= FULL_RADIUS) return 1;
  // Disque moins les quatre segments qui dépassent des côtés.
  const segment = radius * radius * Math.acos(0.5 / radius) - 0.5 * Math.sqrt(radius * radius - 0.25);
  return Math.PI * radius * radius - 4 * segment;
}

/** Rayon (en cellules) du point qui recouvre la part `coverage` de la cellule : la tonalité d'ensemble est respectée. */
export function dotRadiusForCoverage(coverage: number): number {
  if (coverage <= 0) return 0;
  if (coverage >= 1) return FULL_RADIUS;
  let lo = 0;
  let hi = FULL_RADIUS;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (coverageOfRadius(mid) < coverage) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Trame de demi-teintes : points ronds sur une grille à 45°, de la teinte de la zone, sur fond sombre.
 * La taille d'un point donne la clarté (valeur) de la zone ; la couleur reste vive.
 */
export function* halftone(src: Pixels, amount: number): Steps<Pixels> {
  const { width, height, data } = src;
  const cell = width / Math.max(4, Math.round(lerp(HALFTONE_COLS_FINE, HALFTONE_COLS_COARSE, clamp01(amount))));
  const du = Math.SQRT1_2 / cell; // variation de u quand x avance d'un pixel
  const dv = -Math.SQRT1_2 / cell;
  const eu = Math.SQRT1_2 / cell; // variation quand y avance d'un pixel
  const ev = Math.SQRT1_2 / cell;

  const us = [0, width * du, height * eu, width * du + height * eu];
  const vs = [0, width * dv, height * ev, width * dv + height * ev];
  const u0 = Math.floor(Math.min(...us));
  const v0 = Math.floor(Math.min(...vs));
  const nu = Math.floor(Math.max(...us)) - u0 + 1;
  const nv = Math.floor(Math.max(...vs)) - v0 + 1;
  const sums = new Float64Array(nu * nv * 3);
  const counts = new Uint32Array(nu * nv);

  // Passe 1 : couleur moyenne de chaque cellule de la grille tournée.
  for (let y = 0; y < height; y++) {
    let u = 0.5 * du + (y + 0.5) * eu;
    let v = 0.5 * dv + (y + 0.5) * ev;
    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4) {
      const cellIndex = (Math.floor(v) - v0) * nu + (Math.floor(u) - u0);
      const s = cellIndex * 3;
      sums[s] = sums[s]! + data[p]!;
      sums[s + 1] = sums[s + 1]! + data[p + 1]!;
      sums[s + 2] = sums[s + 2]! + data[p + 2]!;
      counts[cellIndex] = counts[cellIndex]! + 1;
      u += du;
      v += dv;
    }
    if (y % 16 === 15) yield;
  }

  const radii = new Float32Array(256);
  for (let i = 0; i < 256; i++) radii[i] = dotRadiusForCoverage(i / 255);
  const [bgR, bgG, bgB] = HALFTONE_BACKGROUND;
  const out = new Uint8ClampedArray(data.length);

  // Passe 2 : dessin des points, bords adoucis sur un pixel.
  for (let y = 0; y < height; y++) {
    let u = 0.5 * du + (y + 0.5) * eu;
    let v = 0.5 * dv + (y + 0.5) * ev;
    let p = y * width * 4;
    for (let x = 0; x < width; x++, p += 4) {
      const iu = Math.floor(u);
      const iv = Math.floor(v);
      const cellIndex = (iv - v0) * nu + (iu - u0);
      const count = counts[cellIndex]!;
      let r = bgR as number;
      let g = bgG as number;
      let b = bgB as number;
      if (count > 0) {
        const s = cellIndex * 3;
        const ar = sums[s]! / count;
        const ag = sums[s + 1]! / count;
        const ab = sums[s + 2]! / count;
        const value = Math.max(ar, ag, ab) / 255;
        if (value > 0.004) {
          const radius = radii[Math.round(value * 255)]! * cell;
          const dx = (u - iu - 0.5) * cell;
          const dy = (v - iv - 0.5) * cell;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const alpha = clamp01(radius - distance + 0.5);
          if (alpha > 0) {
            // Couleur du point : la teinte de la zone à pleine valeur ; sa taille porte la clarté.
            const dr = Math.min(255, ar / value);
            const dg = Math.min(255, ag / value);
            const db = Math.min(255, ab / value);
            r += (dr - r) * alpha;
            g += (dg - g) * alpha;
            b += (db - b) * alpha;
          }
        }
      }
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = 255;
      u += du;
      v += dv;
    }
    if (y % 16 === 15) yield;
  }
  return { data: out, width, height };
}

/* ---------- Peinture (filtre de Kuwahara) ---------- */

const PAINT_RADIUS_FINE = 0.003;
const PAINT_RADIUS_BOLD = 0.016;
/** Lignes traitées par tranche (≈ 50 000 pixels) : mémoire bornée et reprise de la main régulière. */
const BAND_PIXELS = 50_000;

/** Rayon du filtre de peinture (pixels) pour une largeur et une intensité données. */
export function paintRadius(width: number, amount: number): number {
  return Math.max(1, Math.min(24, Math.round(width * lerp(PAINT_RADIUS_FINE, PAINT_RADIUS_BOLD, clamp01(amount)))));
}

type Plane = Int32Array | Float64Array;

/** Somme de la plage [x0, x1] × [y0, y1] (inclus) d'une table de sommes cumulées. */
function boxSum(plane: Plane, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  return plane[(y1 + 1) * stride + x1 + 1]! - plane[y0 * stride + x1 + 1]! - plane[(y1 + 1) * stride + x0]! + plane[y0 * stride + x0]!;
}

/**
 * Filtre de Kuwahara : chaque pixel prend la couleur moyenne du quart de voisinage (de côté radius + 1)
 * où la luminosité varie le moins. Les aplats se lissent, les contours restent nets : effet peinture.
 * Sommes cumulées calculées par bandes : coût indépendant du rayon.
 */
export function* kuwahara(src: Pixels, radius: number): Steps<Pixels> {
  const { width: w, height: h, data } = src;
  const r = Math.max(1, Math.round(radius));
  const out = new Uint8ClampedArray(data.length);
  const band = Math.max(4, Math.min(h, Math.floor(BAND_PIXELS / w)));
  const stride = w + 1;
  const capacity = (band + 2 * r + 1) * stride;
  const sr = new Int32Array(capacity);
  const sg = new Int32Array(capacity);
  const sb = new Int32Array(capacity);
  const sy = new Int32Array(capacity);
  const sq = new Float64Array(capacity);

  for (let y0 = 0; y0 < h; y0 += band) {
    const y1 = Math.min(h, y0 + band);
    const top = Math.max(0, y0 - r);
    const rows = Math.min(h, y1 + r) - top;
    // Tables de sommes cumulées de la bande (ligne 0 et colonne 0 : zéros).
    sr.fill(0, 0, stride);
    sg.fill(0, 0, stride);
    sb.fill(0, 0, stride);
    sy.fill(0, 0, stride);
    sq.fill(0, 0, stride);
    for (let j = 0; j < rows; j++) {
      const row = (j + 1) * stride;
      const prev = j * stride;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let yy = 0;
      let qq = 0;
      let p = (top + j) * w * 4;
      sr[row] = sg[row] = sb[row] = sy[row] = sq[row] = 0;
      for (let i = 0; i < w; i++, p += 4) {
        const cr = data[p]!;
        const cg = data[p + 1]!;
        const cb = data[p + 2]!;
        const lum = (cr * 77 + cg * 151 + cb * 28) >> 8;
        rr += cr;
        gg += cg;
        bb += cb;
        yy += lum;
        qq += lum * lum;
        sr[row + i + 1] = sr[prev + i + 1]! + rr;
        sg[row + i + 1] = sg[prev + i + 1]! + gg;
        sb[row + i + 1] = sb[prev + i + 1]! + bb;
        sy[row + i + 1] = sy[prev + i + 1]! + yy;
        sq[row + i + 1] = sq[prev + i + 1]! + qq;
      }
    }

    for (let y = y0; y < y1; y++) {
      const ya = Math.max(0, y - r) - top;
      const yb = y - top;
      const yc = Math.min(h - 1, y + r) - top;
      let p = y * w * 4;
      for (let x = 0; x < w; x++, p += 4) {
        const xa = Math.max(0, x - r);
        const xc = Math.min(w - 1, x + r);
        let bestVariance = Number.POSITIVE_INFINITY;
        let bx0 = 0;
        let bx1 = 0;
        let by0 = 0;
        let by1 = 0;
        // Quatre quarts : haut-gauche, haut-droite, bas-gauche, bas-droite (le pixel est dans les quatre).
        for (let q = 0; q < 4; q++) {
          const x0 = q & 1 ? x : xa;
          const x1 = q & 1 ? xc : x;
          const y0q = q & 2 ? yb : ya;
          const y1q = q & 2 ? yc : yb;
          const n = (x1 - x0 + 1) * (y1q - y0q + 1);
          const mean = boxSum(sy, stride, x0, y0q, x1, y1q) / n;
          const variance = boxSum(sq, stride, x0, y0q, x1, y1q) / n - mean * mean;
          if (variance < bestVariance) {
            bestVariance = variance;
            bx0 = x0;
            bx1 = x1;
            by0 = y0q;
            by1 = y1q;
          }
        }
        const n = (bx1 - bx0 + 1) * (by1 - by0 + 1);
        out[p] = boxSum(sr, stride, bx0, by0, bx1, by1) / n;
        out[p + 1] = boxSum(sg, stride, bx0, by0, bx1, by1) / n;
        out[p + 2] = boxSum(sb, stride, bx0, by0, bx1, by1) / n;
        out[p + 3] = 255;
      }
    }
    yield;
  }
  return { data: out, width: w, height: h };
}

/** Applique l'effet ; renvoie l'image d'entrée telle quelle quand il n'y en a pas. */
export function* runEffect(src: Pixels, effect: EffectParams): Steps<Pixels> {
  const amount = clamp01(effect.amount);
  switch (effect.kind) {
    case 'pixel':
      return yield* pixelArt(src, amount);
    case 'mosaic':
      return yield* mosaic(src, amount);
    case 'halftone':
      return yield* halftone(src, amount);
    case 'paint':
      return yield* kuwahara(src, paintRadius(src.width, amount));
    default:
      return src;
  }
}
