import { UNKNOWN_COLOR } from '@/features/sources/filters';
import { sourceLabel } from '@/features/sources/registry';
import type { Wallpaper } from '@/features/sources/types';
import type { LibrarySort } from './model';

export const SORT_OPTIONS: readonly { value: LibrarySort; label: string; hint: string }[] = [
  { value: 'added', label: 'Date d’ajout', hint: 'Les derniers ajoutés d’abord' },
  { value: 'color', label: 'Couleur', hint: 'Du rouge au rose, puis les gris' },
  { value: 'source', label: 'Source', hint: 'Unsplash, Pexels… regroupés' },
  { value: 'name', label: 'Nom', hint: 'Ordre alphabétique' },
];

export const sortLabel = (sort: LibrarySort): string => SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Date d’ajout';

export interface Hsl {
  /** Teinte en degrés, 0 à 360 (exclu). */
  h: number;
  s: number;
  l: number;
}

/** Teinte, saturation et luminosité d'une couleur « #rrggbb » ; null si le texte n'est pas une couleur. */
export function toHsl(hex: string): Hsl | null {
  const digits = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(digits)) return null;
  const n = Number.parseInt(digits, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Largeur d'une famille de teintes pour le tri : au sein d'une famille, du plus sombre au plus clair. */
export const HUE_BUCKET = 30;
/** En dessous : couleur trop terne pour avoir une teinte (gris, noir, blanc cassé). */
const NEUTRAL_SATURATION = 0.15;

/**
 * Clé de tri par couleur : les teintes d'abord (du rouge au rose, par familles de 30°, chaque
 * famille du sombre au clair), puis les gris du plus sombre au plus clair, enfin les fonds sans
 * couleur connue.
 */
export function colorSortKey(color: string): [group: number, bucket: number, lightness: number] {
  if (color.toLowerCase() === UNKNOWN_COLOR) return [2, 0, 0];
  const hsl = toHsl(color);
  if (!hsl) return [2, 0, 0];
  if (hsl.s < NEUTRAL_SATURATION || hsl.l < 0.1 || hsl.l > 0.92) return [1, 0, hsl.l];
  return [0, Math.floor(hsl.h / HUE_BUCKET), hsl.l];
}

export interface FavoriteEntry {
  wallpaper: Wallpaper;
  /** Date d'ajout aux favoris (ms). */
  addedAt: number;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

function compareColor(a: Wallpaper, b: Wallpaper): number {
  const ka = colorSortKey(a.color);
  const kb = colorSortKey(b.color);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}

/** Trie les favoris ; à égalité, le plus récemment ajouté passe devant. */
export function sortFavorites(entries: readonly FavoriteEntry[], sort: LibrarySort): Wallpaper[] {
  const byDate = (a: FavoriteEntry, b: FavoriteEntry) => b.addedAt - a.addedAt || collator.compare(a.wallpaper.id, b.wallpaper.id);
  const compare: (a: FavoriteEntry, b: FavoriteEntry) => number = {
    added: byDate,
    color: (a: FavoriteEntry, b: FavoriteEntry) => compareColor(a.wallpaper, b.wallpaper) || byDate(a, b),
    source: (a: FavoriteEntry, b: FavoriteEntry) =>
      collator.compare(sourceLabel(a.wallpaper.source), sourceLabel(b.wallpaper.source)) || byDate(a, b),
    name: (a: FavoriteEntry, b: FavoriteEntry) => collator.compare(a.wallpaper.alt, b.wallpaper.alt) || byDate(a, b),
  }[sort];
  return [...entries].sort(compare).map((e) => e.wallpaper);
}
