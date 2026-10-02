import { UNKNOWN_COLOR, classifyColor } from '@/features/sources/filters';
import { sourceLabel } from '@/features/sources/registry';
import type { ColorFilter, Wallpaper, WallpaperSource } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import type { LibraryData } from './model';

/**
 * Collections automatiques : calculées à partir de la bibliothèque, jamais enregistrées ni
 * modifiables. Leur identifiant commence par « auto: » pour les distinguer des collections de
 * l'utilisateur dans la navigation.
 */
export interface AutoCollection {
  id: string;
  name: string;
  /** Ce qu'elle regroupe, affiché sous son titre. */
  hint: string;
  /** Fonds, dans l'ordre d'affichage. */
  ids: string[];
}

export const AUTO_PREFIX = 'auto:';
/** « Récemment appliqués » : les derniers fonds différents appliqués. */
export const RECENT_LIMIT = 30;

export const isAutoId = (id: string): boolean => id.startsWith(AUTO_PREFIX);

type ColorFamily = Exclude<ColorFilter, 'black_and_white'>;

/** Familles de teintes, dans l'ordre d'affichage : le spectre, puis les neutres (noms en français, traduits dans `buildAutoCollections`). */
export const COLOR_FAMILIES: readonly { family: ColorFamily; name: string }[] = [
  { family: 'red', name: 'Rouges' },
  { family: 'orange', name: 'Oranges' },
  { family: 'yellow', name: 'Jaunes' },
  { family: 'green', name: 'Verts' },
  { family: 'teal', name: 'Turquoises' },
  { family: 'blue', name: 'Bleus' },
  { family: 'purple', name: 'Violets' },
  { family: 'pink', name: 'Roses' },
  { family: 'gray', name: 'Gris' },
  { family: 'black', name: 'Sombres' },
  { family: 'white', name: 'Clairs' },
];

/** Famille de teinte de la couleur dominante ; null quand la source ne la donne pas. */
export function colorFamily(w: Pick<Wallpaper, 'color'>): ColorFamily | null {
  if (w.color.toLowerCase() === UNKNOWN_COLOR) return null;
  return (classifyColor(w.color).find((c) => c !== 'black_and_white') as ColorFamily | undefined) ?? null;
}

/** Fonds conservés par l'utilisateur : favoris (récents d'abord), puis le contenu de ses collections. */
export function savedIds(lib: Pick<LibraryData, 'items' | 'favorites' | 'collections'>): string[] {
  const ids = new Set(
    Object.entries(lib.favorites)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id),
  );
  for (const c of lib.collections) for (const id of c.itemIds) ids.add(id);
  return [...ids].filter((id) => lib.items[id]);
}

/** Les fonds différents appliqués en dernier (historique du plus récent au plus ancien). */
export function recentlyAppliedIds(history: LibraryData['history'], items: LibraryData['items'], limit = RECENT_LIMIT): string[] {
  const ids = new Set<string>();
  for (const entry of [...history].sort((a, b) => b.at - a.at)) {
    if (items[entry.wallpaperId]) ids.add(entry.wallpaperId);
    if (ids.size >= limit) break;
  }
  return [...ids];
}

function push<K>(map: Map<K, string[]>, key: K, id: string) {
  const list = map.get(key);
  if (list) list.push(id);
  else map.set(key, [id]);
}

/** Toutes les collections automatiques non vides, dans l'ordre d'affichage. */
export function buildAutoCollections(lib: Pick<LibraryData, 'items' | 'favorites' | 'collections' | 'history'>): AutoCollection[] {
  const out: AutoCollection[] = [];
  const saved = savedIds(lib);
  const applied = new Set(lib.history.map((h) => h.wallpaperId));

  const recent = recentlyAppliedIds(lib.history, lib.items);
  if (recent.length > 0) {
    out.push({ id: `${AUTO_PREFIX}recent`, name: t('Récemment appliqués'), hint: t('Les {limit} derniers fonds appliqués', { limit: RECENT_LIMIT }), ids: recent });
  }

  const never = saved.filter((id) => !applied.has(id));
  if (never.length > 0) {
    out.push({ id: `${AUTO_PREFIX}never`, name: t('Jamais appliqués'), hint: t('Favoris et collections absents de l’historique'), ids: never });
  }

  const byFamily = new Map<ColorFamily, string[]>();
  const bySource = new Map<WallpaperSource, string[]>();
  for (const id of saved) {
    const w = lib.items[id];
    if (!w) continue;
    const family = colorFamily(w);
    if (family) push(byFamily, family, id);
    push(bySource, w.source, id);
  }
  for (const { family, name } of COLOR_FAMILIES) {
    const ids = byFamily.get(family);
    if (ids) out.push({ id: `${AUTO_PREFIX}color:${family}`, name: t(name), hint: t('Couleur dominante'), ids });
  }
  for (const [source, ids] of [...bySource.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    out.push({ id: `${AUTO_PREFIX}source:${source}`, name: t(sourceLabel(source)), hint: t('Source'), ids });
  }
  return out;
}
