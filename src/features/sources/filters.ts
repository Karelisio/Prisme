import type { ColorFilter, RatioFilter, Wallpaper } from './types';

/** Seuils « portrait haute résolution » appliqués à toutes les sources distantes. */
export const MIN_HEIGHT = 1920;
export const MIN_PORTRAIT_RATIO = 1.2;

export function isHighResPortrait(w: Pick<Wallpaper, 'width' | 'height'>): boolean {
  return w.height >= MIN_HEIGHT && w.height / w.width >= MIN_PORTRAIT_RATIO;
}

export interface RatioOption {
  value: RatioFilter;
  label: string;
  /** Intervalle hauteur / largeur, borne haute exclue. */
  range?: [number, number];
}

export const RATIO_OPTIONS: readonly RatioOption[] = [
  { value: 'all', label: 'Tous' },
  { value: 'screen', label: 'Mon écran' },
  { value: 'tall', label: '20:9 et plus', range: [1.95, 4] },
  { value: 'standard', label: '16:9', range: [1.6, 1.95] },
  { value: 'wide', label: '4:3 · 3:2', range: [1.2, 1.6] },
];

/** Écart toléré avec le ratio de l'écran pour le filtre « Mon écran ». */
const SCREEN_TOLERANCE = 0.1;

export function matchesRatio(w: Pick<Wallpaper, 'width' | 'height'>, ratio: RatioFilter, screenRatio: number): boolean {
  if (ratio === 'all') return true;
  const r = w.height / w.width;
  if (ratio === 'screen') return Math.abs(r - screenRatio) / screenRatio <= SCREEN_TOLERANCE;
  const range = RATIO_OPTIONS.find((o) => o.value === ratio)?.range;
  return !range || (r >= range[0] && r < range[1]);
}

export interface ColorOption {
  value: ColorFilter;
  label: string;
  swatch: string;
}

export const COLOR_OPTIONS: readonly ColorOption[] = [
  { value: 'black', label: 'Noir', swatch: '#111111' },
  { value: 'white', label: 'Blanc', swatch: '#f5f5f5' },
  { value: 'gray', label: 'Gris', swatch: '#9e9e9e' },
  { value: 'red', label: 'Rouge', swatch: '#e53935' },
  { value: 'orange', label: 'Orange', swatch: '#fb8c00' },
  { value: 'yellow', label: 'Jaune', swatch: '#fdd835' },
  { value: 'green', label: 'Vert', swatch: '#43a047' },
  { value: 'teal', label: 'Turquoise', swatch: '#00897b' },
  { value: 'blue', label: 'Bleu', swatch: '#1e88e5' },
  { value: 'purple', label: 'Violet', swatch: '#8e24aa' },
  { value: 'pink', label: 'Rose', swatch: '#d81b60' },
  { value: 'black_and_white', label: 'Noir et blanc', swatch: 'linear-gradient(135deg, #111 50%, #f5f5f5 50%)' },
];

/** Paramètre `color` d'Unsplash ; null si Unsplash ne sait pas filtrer cette couleur. */
export function unsplashColor(color: ColorFilter): string | null {
  const map: Partial<Record<ColorFilter, string>> = {
    black: 'black',
    white: 'white',
    red: 'red',
    orange: 'orange',
    yellow: 'yellow',
    green: 'green',
    teal: 'teal',
    blue: 'blue',
    purple: 'purple',
    pink: 'magenta',
    black_and_white: 'black_and_white',
  };
  return map[color] ?? null;
}

/** Paramètre `color` de Pexels ; null si Pexels ne sait pas filtrer cette couleur. */
export function pexelsColor(color: ColorFilter): string | null {
  const map: Partial<Record<ColorFilter, string>> = {
    black: 'black',
    white: 'white',
    gray: 'gray',
    red: 'red',
    orange: 'orange',
    yellow: 'yellow',
    green: 'green',
    teal: 'turquoise',
    blue: 'blue',
    purple: 'violet',
    pink: 'pink',
  };
  return map[color] ?? null;
}

/**
 * Classe une couleur moyenne (#rrggbb) dans un filtre de couleur : sert pour les sources qui ne
 * filtrent pas côté serveur (collections, packs d'images).
 */
export function classifyColor(hex: string): ColorFilter[] {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return [];
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (l < 0.16) return ['black', 'black_and_white'];
  if (l > 0.88 && s < 0.5) return ['white', 'black_and_white'];
  if (s < 0.15) return ['gray', 'black_and_white'];

  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;

  if (h < 15 || h >= 345) return ['red'];
  if (h < 45) return ['orange'];
  if (h < 70) return ['yellow'];
  if (h < 160) return ['green'];
  if (h < 195) return ['teal'];
  if (h < 255) return ['blue'];
  if (h < 290) return ['purple'];
  return ['pink'];
}

export function matchesColor(w: Pick<Wallpaper, 'color'>, color: ColorFilter | null): boolean {
  return color === null || classifyColor(w.color).includes(color);
}
