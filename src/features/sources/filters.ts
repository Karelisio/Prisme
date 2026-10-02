import type { ColorChoice, ColorFilter, RatioFilter, Wallpaper } from './types';

/** Couleur moyenne inconnue (la source ne la fournit pas) : ignorée par les filtres de couleur. */
export const UNKNOWN_COLOR = '#808080';

/** Seuils « portrait haute résolution » appliqués à toutes les sources distantes. */
export const MIN_HEIGHT = 1920;
export const MIN_PORTRAIT_RATIO = 1.2;
/** Pixabay (clé gratuite) sert au plus 1280 px : seuil abaissé pour cette source, désactivée par défaut. */
export const PIXABAY_MIN_HEIGHT = 1200;

export function isHighResPortrait(w: Pick<Wallpaper, 'width' | 'height'>, minHeight = MIN_HEIGHT): boolean {
  return w.height >= minHeight && w.height / w.width >= MIN_PORTRAIT_RATIO;
}

/**
 * Image distante utilisable comme fond. Les photos de la NASA (souvent en paysage, ciel et espace)
 * restent belles recadrées en portrait : seule la hauteur compte, et une taille inconnue passe.
 */
export function fitsWallpaper(w: Pick<Wallpaper, 'source' | 'width' | 'height'>): boolean {
  if (w.source === 'nasa') return w.width === 0 || w.height >= MIN_HEIGHT;
  if (w.source === 'pixabay') return isHighResPortrait(w, PIXABAY_MIN_HEIGHT);
  return isHighResPortrait(w);
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
  if (!w.width || !w.height) return false;
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

export const isHexColor = (choice: ColorChoice): choice is `#${string}` => choice.startsWith('#');

/** Nuancier : 12 teintes × 4 tons, puis une rangée de gris (du noir au blanc). */
export const SHADE_HUES = [0, 30, 45, 60, 90, 130, 170, 195, 215, 245, 275, 320] as const;
export const SHADE_LIGHTNESS = [0.28, 0.42, 0.56, 0.72] as const;

export function hslToHex(h: number, s: number, l: number): `#${string}` {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export const SHADES: readonly `#${string}`[] = [
  ...SHADE_LIGHTNESS.flatMap((l) => SHADE_HUES.map((h) => hslToHex(h, 0.75, l))),
  ...[0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.97].map((l) => hslToHex(0, 0, l)),
];

/** Libellé d'un filtre de couleur (pastille nommée ou teinte du nuancier). */
export function colorLabel(choice: ColorChoice): string {
  if (isHexColor(choice)) return `Teinte ${choice.toUpperCase()}`;
  return COLOR_OPTIONS.find((o) => o.value === choice)?.label ?? choice;
}

export function colorSwatch(choice: ColorChoice): string {
  if (isHexColor(choice)) return choice;
  return COLOR_OPTIONS.find((o) => o.value === choice)?.swatch ?? '#808080';
}

/** Teinte nommée la plus proche d'une couleur du nuancier (les sources ne filtrent pas toutes en hexa). */
export function namedColor(choice: ColorChoice): ColorFilter | null {
  if (!isHexColor(choice)) return choice;
  return classifyColor(choice).find((c) => c !== 'black_and_white') ?? null;
}

/** Paramètre `color` d'Unsplash ; null si Unsplash ne sait pas filtrer cette couleur. */
export function unsplashColor(choice: ColorChoice): string | null {
  const color = namedColor(choice);
  if (!color) return null;
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

/** Paramètre `color` de Pexels (qui accepte aussi un code hexadécimal) ; null s'il ne sait pas filtrer. */
export function pexelsColor(choice: ColorChoice): string | null {
  if (isHexColor(choice)) return choice;
  const color = choice;
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

/** Palette fixe acceptée par le paramètre `colors` de Wallhaven. */
export const WALLHAVEN_COLORS = [
  '660000', '990000', 'cc0000', 'cc3333', 'ea4c88', '993399', '663399', '333399', '0066cc', '0099cc', '66cccc', '77cc33', '669900',
  '336600', '666600', '999900', 'cccc33', 'ffff00', 'ffcc33', 'ff9900', 'ff6600', 'cc6633', '996633', '663300', '000000', '999999',
  'cccccc', 'ffffff', '424153',
] as const;

const NAMED_HEX: Partial<Record<ColorFilter, string>> = {
  black: '000000',
  white: 'ffffff',
  gray: '999999',
  red: 'cc0000',
  orange: 'ff9900',
  yellow: 'ffff00',
  green: '669900',
  teal: '66cccc',
  blue: '0066cc',
  purple: '663399',
  pink: 'ea4c88',
};

function rgb(hex: string): [number, number, number] | null {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Couleur de la palette Wallhaven la plus proche ; null pour « noir et blanc » (non filtrable). */
export function wallhavenColor(choice: ColorChoice): string | null {
  const target = rgb(isHexColor(choice) ? choice : (NAMED_HEX[choice] ?? ''));
  if (!target) return null;
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hex of WALLHAVEN_COLORS) {
    const c = rgb(hex) as [number, number, number];
    const distance = (c[0] - target[0]) ** 2 + (c[1] - target[1]) ** 2 + (c[2] - target[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hex;
    }
  }
  return best;
}

/** Paramètre `colors` de Pixabay. */
export function pixabayColor(choice: ColorChoice): string | null {
  const color = namedColor(choice) ?? (isHexColor(choice) ? null : choice);
  if (!color) return null;
  const map: Record<ColorFilter, string> = {
    black: 'black',
    white: 'white',
    gray: 'gray',
    red: 'red',
    orange: 'orange',
    yellow: 'yellow',
    green: 'green',
    teal: 'turquoise',
    blue: 'blue',
    purple: 'lilac',
    pink: 'pink',
    black_and_white: 'grayscale',
  };
  return map[color];
}

/** Luminosité perçue (0 à 1) d'une couleur moyenne. */
export function brightness(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0.5;
  return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
}

/** Fond « AMOLED » : couleur moyenne presque noire. */
export const AMOLED_MAX_BRIGHTNESS = 0.13;
export const isAmoled = (w: Pick<Wallpaper, 'color'>) => brightness(w.color) <= AMOLED_MAX_BRIGHTNESS;

/** Filtre AMOLED : couleur moyenne vérifiée ; inconnue, on se fie au serveur s'il a filtré le noir. */
export function matchesAmoled(w: Pick<Wallpaper, 'color'>, serverFilteredBlack: boolean): boolean {
  return w.color.toLowerCase() === UNKNOWN_COLOR ? serverFilteredBlack : isAmoled(w);
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

export function matchesColor(w: Pick<Wallpaper, 'color'>, color: ColorChoice | null): boolean {
  if (color === null) return true;
  if (w.color.toLowerCase() === UNKNOWN_COLOR) return false;
  const named = namedColor(color);
  return named === null || classifyColor(w.color).includes(named);
}
