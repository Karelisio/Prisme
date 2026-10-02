import { CATEGORIES, type Category } from '@/features/browse/categories';
import type { FeedSpec, SourceQuery } from '@/features/sources/feed';
import { COLOR_OPTIONS, colorLabel } from '@/features/sources/filters';
import type { ColorFilter } from '@/features/sources/types';
import { MAX_TASTE_CATEGORIES, MAX_TASTE_COLORS, type Tastes } from './store';

/** Sélections générales d'Explorer : ce ne sont pas des goûts. */
const GENERAL_CATEGORIES = new Set(['featured', 'trending', 'latest']);

/** Thèmes proposés à l'introduction : les catégories d'Explorer, hors sélections générales. */
export const TASTE_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => !GENERAL_CATEGORIES.has(c.key));

/** Couleurs proposées : les teintes nommées, sans « noir et blanc » (deux teintes à la fois). */
export const TASTE_COLORS = COLOR_OPTIONS.filter((o) => o.value !== 'black_and_white');

/** Requêtes retenues par thème : les deux premières (thème Unsplash et recherche Pexels, ou la source dédiée). */
const QUERIES_PER_CATEGORY = 2;

const knownCategories = (tastes: Tastes) => tastes.categories.flatMap((key) => TASTE_CATEGORIES.find((c) => c.key === key) ?? []);
const knownColors = (tastes: Tastes) => tastes.colors.filter((color) => TASTE_COLORS.some((o) => o.value === color));

/** Au moins un goût reconnu (un enregistrement abîmé ou d'une autre version peut en contenir d'inconnus). */
export const hasTastes = (tastes: Tastes): boolean => knownCategories(tastes).length > 0 || knownColors(tastes).length > 0;

/** Ajoute ou retire un choix ; au-delà de `max`, le plus ancien est oublié. */
export function toggleChoice<T>(list: readonly T[], value: T, max: number): T[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return [...list, value].slice(-max);
}

export const toggleCategory = (tastes: Tastes, key: string): Tastes => ({
  ...tastes,
  categories: toggleChoice(tastes.categories, key, MAX_TASTE_CATEGORIES),
});

export const toggleColor = (tastes: Tastes, color: ColorFilter): Tastes => ({
  ...tastes,
  colors: toggleChoice(tastes.colors, color, MAX_TASTE_COLORS),
});

/** Libellés des goûts, pour les afficher (« Nature, Minimal, Bleu »). */
export function tasteLabels(tastes: Tastes): string[] {
  return [...knownCategories(tastes).map((c) => c.label), ...knownColors(tastes).map((color) => colorLabel(color))];
}

/** Flux « Pour toi » d'après les goûts choisis à l'introduction ; null sans goût connu. */
export function tasteSpec(tastes: Tastes): FeedSpec | null {
  const categories = knownCategories(tastes);
  const colors = knownColors(tastes);
  const queries: SourceQuery[] = [
    ...categories.flatMap((c) => c.queries.slice(0, QUERIES_PER_CATEGORY)),
    ...colors.flatMap((color): SourceQuery[] => [
      { kind: 'unsplash-search', query: 'wallpaper', color },
      { kind: 'wallhaven', sorting: 'toplist', color },
    ]),
  ];
  if (queries.length === 0) return null;
  return { key: `taste|${categories.map((c) => c.key).join(',')}|${colors.join(',')}`, queries };
}
