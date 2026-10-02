import { Hct, TonalPalette, argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import type { ColorScheme } from '@/shared/theme/scheme';
import { type RGB, clamp01, lerp, luma, parseHex } from './color';

/**
 * Filtres photo : calculs de couleur purs sur des pixels RGBA (octets). Chaque filtre produit sa
 * version « pleine » ; le curseur d'intensité fond ensuite le résultat avec l'image d'origine.
 */

export type FilterKind = 'none' | 'mono' | 'sepia' | 'vintage' | 'duotone' | 'contrast' | 'cool' | 'warm';

export interface DuotoneColors {
  shadow: string;
  highlight: string;
}

export interface FilterParams {
  kind: FilterKind;
  /** 0..1 : part du filtre mélangée à l'image d'origine. */
  intensity: number;
  /** Couleurs du filtre Duotone (ombres, lumières). */
  duotone: DuotoneColors;
}

export const FILTERS: readonly { kind: FilterKind; label: string }[] = [
  { kind: 'none', label: 'Aucun' },
  { kind: 'mono', label: 'Noir et blanc' },
  { kind: 'sepia', label: 'Sépia' },
  { kind: 'vintage', label: 'Vintage' },
  { kind: 'duotone', label: 'Duotone' },
  { kind: 'contrast', label: 'Contraste' },
  { kind: 'cool', label: 'Froid' },
  { kind: 'warm', label: 'Chaud' },
];

export interface DuotonePreset extends DuotoneColors {
  id: string;
  label: string;
}

export const DUOTONE_PRESETS: readonly DuotonePreset[] = [
  { id: 'crepuscule', label: 'Crépuscule', shadow: '#1b1464', highlight: '#ffb199' },
  { id: 'ocean', label: 'Océan', shadow: '#03233a', highlight: '#7ff0ff' },
  { id: 'foret', label: 'Forêt', shadow: '#0b2b1f', highlight: '#d6f78a' },
  { id: 'braise', label: 'Braise', shadow: '#2a0a0a', highlight: '#ffb347' },
  { id: 'orchidee', label: 'Orchidée', shadow: '#2a0a45', highlight: '#ffc2f0' },
  { id: 'glace', label: 'Glace', shadow: '#0a1f44', highlight: '#e3f3ff' },
];

const DEFAULT_DUOTONE: DuotoneColors = { shadow: '#1b1464', highlight: '#ffb199' };

export const DEFAULT_FILTER: FilterParams = { kind: 'none', intensity: 1, duotone: DEFAULT_DUOTONE };

export function isFilterActive(f: FilterParams): boolean {
  return f.kind !== 'none' && f.intensity > 0;
}

/**
 * Duotones tirés de la palette Material You : ombres dans la teinte primaire, lumières dans la
 * teinte tertiaire (ou dans la même teinte, ton sur ton), à des tons fixes pour un contraste franc.
 */
export function materialDuotones(scheme: ColorScheme): DuotonePreset[] {
  const tone = (hex: string, t: number) => hexFromArgb(TonalPalette.fromHct(Hct.fromInt(argbFromHex(hex))).tone(t));
  return [
    { id: 'material', label: 'Material You', shadow: tone(scheme.primary, 12), highlight: tone(scheme.tertiary, 88) },
    { id: 'material-mono', label: 'Ton sur ton', shadow: tone(scheme.primary, 15), highlight: tone(scheme.primary, 92) },
  ];
}

/**
 * Courbe en S (table de 256 valeurs) : ombres plus profondes, lumières plus vives, noir et blanc
 * inchangés. `strength` de 0 (courbe identité) à 1 (franche).
 */
export function contrastLut(strength: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const k = 4.5 * clamp01(strength);
  if (k < 0.01) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const s = (x: number) => 1 / (1 + Math.exp(-k * (x - 0.5)));
  const lo = s(0);
  const span = s(1) - lo;
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * ((s(i / 255) - lo) / span));
  return lut;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Assombrissement des bords : 1 au centre, 1 − `strength` dans les coins (nx, ny entre −1 et 1). */
export function vignetteFactor(nx: number, ny: number, strength: number): number {
  const distance = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
  return 1 - strength * smoothstep(0.35, 1, distance);
}

/** Pondérations de gris, identiques à celles du filtre CSS `grayscale` utilisé jusque-là. */
function mono(d: Uint8ClampedArray, t: number) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const y = luma(r, g, b);
    d[i] = r + (y - r) * t;
    d[i + 1] = g + (y - g) * t;
    d[i + 2] = b + (y - b) * t;
  }
}

/** Matrice sépia classique (celle du filtre CSS `sepia`). */
function sepia(d: Uint8ClampedArray, t: number) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    d[i] = r + (0.393 * r + 0.769 * g + 0.189 * b - r) * t;
    d[i + 1] = g + (0.349 * r + 0.686 * g + 0.168 * b - g) * t;
    d[i + 2] = b + (0.272 * r + 0.534 * g + 0.131 * b - b) * t;
  }
}

interface Tint {
  gain: RGB;
  offset: RGB;
}

/** Balance des blancs : gain par canal, avec un léger décalage qui teinte aussi les ombres. */
export const COOL: Tint = { gain: [0.88, 1, 1.14], offset: [0, 2, 8] };
export const WARM: Tint = { gain: [1.12, 1.02, 0.84], offset: [8, 2, 0] };

function tint(d: Uint8ClampedArray, t: number, { gain, offset }: Tint) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    d[i] = r + (r * gain[0] + offset[0] - r) * t;
    d[i + 1] = g + (g * gain[1] + offset[1] - g) * t;
    d[i + 2] = b + (b * gain[2] + offset[2] - b) * t;
  }
}

const PUNCHY_SATURATION = 1.22;

/** « Punchy » : courbe en S sur chaque canal, puis saturation renforcée. */
function contrast(d: Uint8ClampedArray, t: number) {
  const lut = contrastLut(1);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const cr = lut[r]!;
    const cg = lut[g]!;
    const cb = lut[b]!;
    const y = luma(cr, cg, cb);
    d[i] = r + (y + (cr - y) * PUNCHY_SATURATION - r) * t;
    d[i + 1] = g + (y + (cg - y) * PUNCHY_SATURATION - g) * t;
    d[i + 2] = b + (y + (cb - y) * PUNCHY_SATURATION - b) * t;
  }
}

/** Noirs relevés / blancs adoucis (en niveaux sur 255), délavé, chaleur et vignettage du Vintage. */
export const VINTAGE = { lift: 24, dim: 14, desaturate: 0.78, warmth: [1.07, 1, 0.86] as const, vignette: 0.3 };

function vintage(d: Uint8ClampedArray, width: number, height: number, t: number) {
  const { lift, dim, desaturate, warmth, vignette } = VINTAGE;
  const span = (255 - lift - dim) / 255;
  for (let y = 0; y < height; y++) {
    const ny = ((y + 0.5) / height) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const f = vignetteFactor(((x + 0.5) / width) * 2 - 1, ny, vignette);
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const l = luma(r, g, b);
      // Délavé (moins saturé), réchauffé, puis ramené entre noir relevé et blanc adouci.
      const vr = (lift + Math.min(255, (l + (r - l) * desaturate) * warmth[0]) * span) * f;
      const vg = (lift + Math.min(255, (l + (g - l) * desaturate) * warmth[1]) * span) * f;
      const vb = (lift + Math.min(255, (l + (b - l) * desaturate) * warmth[2]) * span) * f;
      d[i] = r + (vr - r) * t;
      d[i + 1] = g + (vg - g) * t;
      d[i + 2] = b + (vb - b) * t;
    }
  }
}

/** Dégradé des ombres vers les lumières selon la luminance (courbe en S adoucie pour plus de relief). */
function duotone(d: Uint8ClampedArray, t: number, colors: DuotoneColors) {
  const [sr, sg, sb] = parseHex(colors.shadow);
  const [hr, hg, hb] = parseHex(colors.highlight);
  const shape = contrastLut(0.45);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const y = shape[Math.round(luma(r, g, b))]! / 255;
    d[i] = r + (lerp(sr, hr, y) - r) * t;
    d[i + 1] = g + (lerp(sg, hg, y) - g) * t;
    d[i + 2] = b + (lerp(sb, hb, y) - b) * t;
  }
}

/** Applique le filtre sur place (pixels RGBA ; la transparence n'est pas touchée). */
export function applyFilter(data: Uint8ClampedArray, width: number, height: number, filter: FilterParams): void {
  const t = clamp01(filter.intensity);
  if (filter.kind === 'none' || t === 0) return;
  switch (filter.kind) {
    case 'mono':
      return mono(data, t);
    case 'sepia':
      return sepia(data, t);
    case 'vintage':
      return vintage(data, width, height, t);
    case 'duotone':
      return duotone(data, t, filter.duotone);
    case 'contrast':
      return contrast(data, t);
    case 'cool':
      return tint(data, t, COOL);
    case 'warm':
      return tint(data, t, WARM);
  }
}
