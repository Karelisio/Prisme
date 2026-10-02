// Dégradé organique (« mesh ») : quelques points de couleur posés au hasard, fondus en douceur.
// La logique (placement, pondération, image calculée) est pure ; seul `drawMesh` touche au canevas.
// Le calcul se fait à basse résolution puis l'image est agrandie avec lissage : l'aperçu reste fluide.

import { type Lab, completePalette, hexToOklab, lightness, oklabToRgb, shiftLightness } from './color';
import { mulberry32, shuffled } from './random';

export const MESH_MIN_POINTS = 4;
export const MESH_MAX_POINTS = 6;

export interface MeshPoint {
  /** Position normalisée dans l'image : 0 à 1 sur la largeur. */
  x: number;
  /** Position normalisée dans l'image : 0 à 1 sur la hauteur. */
  y: number;
  /** Couleur du point (hexadécimal). */
  color: string;
}

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Nombre de points ramené à l'intervalle permis (entier). */
export function clampPointCount(count: number): number {
  return Math.min(MESH_MAX_POINTS, Math.max(MESH_MIN_POINTS, Math.round(Number.isFinite(count) ? count : 5)));
}

/**
 * Pose `count` points de couleur : positions « au meilleur candidat » (chaque point est placé au
 * plus loin des précédents parmi quelques tirages), donc bien répartis sans être alignés.
 * `aspect` est le rapport hauteur / largeur de l'image : les distances sont celles de l'écran.
 */
export function meshPoints(seed: number, count: number, palette: readonly string[], aspect: number): MeshPoint[] {
  const n = clampPointCount(count);
  const random = mulberry32((seed ^ 0x6d657368) >>> 0);
  const [c0, c1, c2, a0, a1, a2] = completePalette(palette.slice(0, 3), palette.slice(3));
  // Le fond et l'accent doux sont toujours présents ; les autres couleurs tournent d'une graine à l'autre.
  // La couleur de contraste n'entre pas telle quelle (un point presque noir ou blanc ternirait tout le
  // dégradé) : on prend l'accent doux, creusé vers le contraste, qui garde sa teinte et sa saturation.
  const deep = shiftLightness(c1, lightness(c2) < lightness(c1) ? -0.22 : 0.22);
  const colors = shuffled([c0, c1, ...shuffled([deep, a0, a1, a2], random).slice(0, n - 2)], random);
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    let best = { x: random(), y: random() };
    let bestGap = -1;
    for (let candidate = 0; candidate < 12; candidate++) {
      const x = random();
      const y = random();
      let gap = Infinity;
      for (const other of placed) gap = Math.min(gap, Math.hypot(x - other.x, (y - other.y) * aspect));
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y };
      }
    }
    placed.push(best);
  }
  return placed.map((p, i) => ({ x: p.x, y: p.y, color: colors[i] as string }));
}

/**
 * Réglages du fondu pour une douceur de 0 à 1 : rayon d'adoucissement (en largeurs d'écran) et
 * exposant de la distance. Douceur faible : zones de couleur bien marquées ; douceur forte : les
 * couleurs se mêlent largement sans jamais se ternir complètement.
 */
export function meshKernel(softness: number): { soften: number; power: number } {
  const t = clamp01(softness);
  return { soften: lerp(0.04, 0.2, t), power: lerp(3.6, 1.4, t) };
}

/**
 * Couleur (OKLab) au point (x, y) de l'image : moyenne des couleurs des points pondérée par
 * l'inverse de la distance adoucie. Les poids sont strictement positifs et de somme 1 : le résultat
 * reste dans l'enveloppe des couleurs, et varie sans à-coup d'un pixel au suivant.
 */
export function meshColorAt(points: readonly MeshPoint[], labs: readonly Lab[], x: number, y: number, softness: number, aspect: number): Lab {
  const { soften, power } = meshKernel(softness);
  const s2 = soften * soften;
  const half = -power / 2;
  let sum = 0;
  let L = 0;
  let a = 0;
  let b = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as MeshPoint;
    const dx = x - p.x;
    const dy = (y - p.y) * aspect;
    const weight = (dx * dx + dy * dy + s2) ** half;
    const lab = labs[i] as Lab;
    sum += weight;
    L += weight * lab[0];
    a += weight * lab[1];
    b += weight * lab[2];
  }
  return [L / sum, a / sum, b / sum];
}

/**
 * Image RGBA (largeur × hauteur) du dégradé. Les coordonnées sont légèrement ondulées (de `wobble`
 * largeurs d'écran) par des sinusoïdes de phases tirées de la graine : les zones de couleur perdent
 * leur allure de disques.
 */
export function meshImage(
  points: readonly MeshPoint[],
  softness: number,
  seed: number,
  width: number,
  height: number,
  aspect: number,
  wobble = 0.03,
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  const labs = points.map((p) => hexToOklab(p.color));
  const { soften, power } = meshKernel(softness);
  const s2 = soften * soften;
  const half = -power / 2;
  const random = mulberry32((seed ^ 0x77617270) >>> 0);
  const phases = Array.from({ length: 4 }, () => random() * TAU);
  const warpX = new Float64Array(height);
  const warpY = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const v = ((y + 0.5) / height) * aspect;
    warpX[y] = wobble * (Math.sin(TAU * 0.6 * v + (phases[0] as number)) + 0.5 * Math.sin(TAU * 1.3 * v + (phases[1] as number)));
  }
  for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width;
    warpY[x] = (wobble * (Math.sin(TAU * 0.7 * u + (phases[2] as number)) + 0.5 * Math.sin(TAU * 1.5 * u + (phases[3] as number)))) / aspect;
  }
  const n = points.length;
  const px = points.map((p) => p.x);
  const py = points.map((p) => p.y);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width + (warpX[y] as number);
      const v = (y + 0.5) / height + (warpY[x] as number);
      let sum = 0;
      let L = 0;
      let a = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        const dx = u - (px[i] as number);
        const dy = (v - (py[i] as number)) * aspect;
        const weight = (dx * dx + dy * dy + s2) ** half;
        const lab = labs[i] as Lab;
        sum += weight;
        L += weight * lab[0];
        a += weight * lab[1];
        b += weight * lab[2];
      }
      const [r, g, bl] = oklabToRgb([L / sum, a / sum, b / sum]);
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = bl;
      data[offset + 3] = 255;
      offset += 4;
    }
  }
  return data;
}

/** Dimensions du calcul à basse résolution : un quart de la taille de rendu, au moins 24 pixels. */
export function meshResolution(width: number, height: number): { width: number; height: number } {
  const w = Math.min(width, Math.max(24, Math.round(width / 4)));
  return { width: w, height: Math.max(2, Math.round((w * height) / width)) };
}

export interface MeshOptions {
  seed: number;
  /** 0 = zones de couleur bien marquées, 1 = fondu très doux. */
  softness: number;
  /** Nombre de points de couleur (4 à 6). */
  points: number;
}

let scratch: HTMLCanvasElement | null = null;

/** Dessine le dégradé : calcul à basse résolution, puis agrandissement filtré sur tout le canevas. */
export function drawMesh(ctx: CanvasRenderingContext2D, palette: readonly string[], options: MeshOptions, width: number, height: number): void {
  const aspect = height / width;
  const low = meshResolution(width, height);
  const image = meshImage(meshPoints(options.seed, options.points, palette, aspect), options.softness, options.seed, low.width, low.height, aspect);
  scratch ??= document.createElement('canvas');
  scratch.width = low.width;
  scratch.height = low.height;
  scratch.getContext('2d')?.putImageData(new ImageData(image, low.width, low.height), 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, 0, 0, width, height);
  ctx.restore();
}
