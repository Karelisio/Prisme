import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import type { NormalizedRect, WallpaperTarget } from '@/shared/native';

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  itemIds: string[];
}

export interface HistoryEntry {
  id: string;
  wallpaperId: string;
  target: WallpaperTarget;
  at: number;
  /** Appliqué automatiquement (rotation, fonds dynamiques, mode focus). */
  auto?: boolean;
  /** Recadrage choisi, pour pouvoir réappliquer le fond à l'identique (annulation). */
  crop?: NormalizedRect;
  /** Image préparée (éditeur, fonds liés) appliquée à la place de la source du fond. */
  uri?: string;
}

/** Copies locales d'une image pour l'usage hors ligne (URL d'origine conservée pour la suppression). */
export interface OfflineCopy {
  thumbUrl?: string;
  thumbPath?: string;
  fullUrl?: string;
  fullPath?: string;
}

/** Ordre de la liste des favoris. */
export type LibrarySort = 'added' | 'color' | 'source' | 'name';

export interface LibraryData {
  /** Catalogue des fonds référencés par les favoris, collections ou l'historique. */
  items: Record<string, Wallpaper>;
  favorites: Record<string, number>;
  collections: Collection[];
  history: HistoryEntry[];
  offline: Record<string, OfflineCopy>;
  /** Étiquettes libres des favoris : identifiant du fond → étiquettes (un fond non favori n'en a pas). */
  tags: Record<string, string[]>;
  /** Tri choisi pour les favoris. */
  sort: LibrarySort;
}

export const EMPTY_LIBRARY: LibraryData = { items: {}, favorites: {}, collections: [], history: [], offline: {}, tags: {}, sort: 'added' };
export const HISTORY_LIMIT = 200;
export const LIBRARY_SORTS: readonly LibrarySort[] = ['added', 'color', 'source', 'name'];

export function referencedIds(state: LibraryData): Set<string> {
  const ids = new Set(Object.keys(state.favorites));
  for (const c of state.collections) for (const id of c.itemIds) ids.add(id);
  for (const h of state.history) ids.add(h.wallpaperId);
  return ids;
}

/** Retire du catalogue les fonds qui ne sont plus référencés nulle part, et les étiquettes des non-favoris. */
export function prune(state: LibraryData): LibraryData {
  const keep = referencedIds(state);
  const items: Record<string, Wallpaper> = {};
  for (const [id, w] of Object.entries(state.items)) if (keep.has(id)) items[id] = w;
  const orphans = Object.keys(state.tags).some((id) => !state.favorites[id]);
  const tags = orphans ? Object.fromEntries(Object.entries(state.tags).filter(([id]) => state.favorites[id])) : state.tags;
  return { ...state, items, tags };
}

function remember(state: LibraryData, w: Wallpaper): Record<string, Wallpaper> {
  return { ...state.items, [w.id]: w };
}

export function toggleFavorite(state: LibraryData, w: Wallpaper, now: number): LibraryData {
  if (state.favorites[w.id]) {
    const { [w.id]: _removed, ...favorites } = state.favorites;
    return prune({ ...state, favorites });
  }
  return { ...state, items: remember(state, w), favorites: { ...state.favorites, [w.id]: now } };
}

export function createCollection(state: LibraryData, id: string, name: string, now: number, first?: Wallpaper): LibraryData {
  const collection: Collection = { id, name: name.trim() || t('Sans titre'), createdAt: now, itemIds: first ? [first.id] : [] };
  return {
    ...state,
    items: first ? remember(state, first) : state.items,
    collections: [collection, ...state.collections],
  };
}

/** Crée la collection avec cet identifiant si elle n'existe pas (ex. « Créations »). */
export function ensureCollection(state: LibraryData, id: string, name: string, now: number): LibraryData {
  if (state.collections.some((c) => c.id === id)) return state;
  return { ...state, collections: [...state.collections, { id, name, createdAt: now, itemIds: [] }] };
}

export function renameCollection(state: LibraryData, id: string, name: string): LibraryData {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return { ...state, collections: state.collections.map((c) => (c.id === id ? { ...c, name: trimmed } : c)) };
}

export function deleteCollection(state: LibraryData, id: string): LibraryData {
  return prune({ ...state, collections: state.collections.filter((c) => c.id !== id) });
}

export function setInCollection(state: LibraryData, collectionId: string, w: Wallpaper, included: boolean): LibraryData {
  const collections = state.collections.map((c) => {
    if (c.id !== collectionId) return c;
    const has = c.itemIds.includes(w.id);
    if (included && !has) return { ...c, itemIds: [w.id, ...c.itemIds] };
    if (!included && has) return { ...c, itemIds: c.itemIds.filter((id) => id !== w.id) };
    return c;
  });
  const next = { ...state, collections, items: included ? remember(state, w) : state.items };
  return included ? next : prune(next);
}

export function addHistory(state: LibraryData, entry: HistoryEntry, w: Wallpaper): LibraryData {
  // Trié du plus récent au plus ancien (les entrées automatiques peuvent arriver après coup).
  const history = [entry, ...state.history].sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT);
  return prune({ ...state, items: remember(state, w), history });
}

export type Screen = 'home' | 'lock';

export interface UndoStep {
  entry: HistoryEntry;
  target: WallpaperTarget;
}

export interface UndoPlan {
  /** Dernière application, celle qu'on annule. */
  undone: HistoryEntry;
  steps: UndoStep[];
  /** Écrans sans fond Prisme antérieur (le fond d'origine du système n'est pas lisible). */
  missing: Screen[];
}

const covers = (target: WallpaperTarget, screen: Screen) => target === 'both' || target === screen;

const sameImage = (a: HistoryEntry, b: HistoryEntry) =>
  a.wallpaperId === b.wallpaperId && a.uri === b.uri && JSON.stringify(a.crop ?? null) === JSON.stringify(b.crop ?? null);

/** Ce qu'il faut réappliquer pour revenir à l'état d'avant la dernière application. */
export function planUndo(history: HistoryEntry[]): UndoPlan | null {
  const [latest, ...older] = history;
  if (!latest) return null;
  const screens: Screen[] = latest.target === 'both' ? ['home', 'lock'] : [latest.target];
  const found = screens.map((screen) => ({ screen, entry: older.find((e) => covers(e.target, screen)) }));
  const missing = found.filter((f) => !f.entry).map((f) => f.screen);
  const [first, second] = found;
  if (first?.entry && second?.entry && sameImage(first.entry, second.entry)) {
    return { undone: latest, steps: [{ entry: first.entry, target: 'both' }], missing };
  }
  const steps = found.flatMap((f) => (f.entry ? [{ entry: f.entry, target: f.screen }] : []));
  return { undone: latest, steps, missing };
}

export function removeHistory(state: LibraryData, entryId: string): LibraryData {
  return prune({ ...state, history: state.history.filter((h) => h.id !== entryId) });
}

export function clearHistory(state: LibraryData): LibraryData {
  return prune({ ...state, history: [] });
}

export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_WALLPAPER = 12;

/** Étiquette nettoyée : espaces réduits, « # » initial retiré, 24 caractères au plus ; vide si rien ne reste. */
export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').slice(0, MAX_TAG_LENGTH).trim();
}

/** « Plage » et « plage » (ou « été » et « ete ») sont la même étiquette. */
export const sameTag = (a: string, b: string): boolean => a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0;

/**
 * Ajoute une étiquette à un favori (sans effet pour un autre fond). L'écriture déjà utilisée
 * pour cette étiquette ailleurs dans la bibliothèque est conservée.
 */
export function addTag(state: LibraryData, id: string, raw: string): LibraryData {
  const tag = cleanTag(raw);
  if (!tag || !state.favorites[id]) return state;
  const current = state.tags[id] ?? [];
  if (current.length >= MAX_TAGS_PER_WALLPAPER || current.some((existing) => sameTag(existing, tag))) return state;
  const known = Object.values(state.tags).flat().find((existing) => sameTag(existing, tag)) ?? tag;
  return { ...state, tags: { ...state.tags, [id]: [...current, known] } };
}

export function removeTag(state: LibraryData, id: string, tag: string): LibraryData {
  const current = state.tags[id];
  if (!current?.some((existing) => sameTag(existing, tag))) return state;
  const left = current.filter((existing) => !sameTag(existing, tag));
  const { [id]: _removed, ...others } = state.tags;
  return { ...state, tags: left.length > 0 ? { ...others, [id]: left } : others };
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Étiquettes utilisées, les plus fréquentes d'abord (puis par ordre alphabétique). */
export function tagCounts(state: Pick<LibraryData, 'tags' | 'favorites'>): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const [id, tags] of Object.entries(state.tags)) {
    if (!state.favorites[id]) continue;
    for (const tag of tags) {
      const known = [...counts.values()].find((c) => sameTag(c.tag, tag));
      if (known) known.count++;
      else counts.set(tag, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr', { sensitivity: 'base' }));
}

export const hasTag = (state: Pick<LibraryData, 'tags'>, id: string, tag: string): boolean => !!state.tags[id]?.some((existing) => sameTag(existing, tag));

/** Nouvelle collection remplie avec des fonds reçus (collection partagée) ; les fonds déjà connus gardent leur fiche. */
export function importCollection(state: LibraryData, id: string, name: string, wallpapers: Wallpaper[], now: number): LibraryData {
  const items = { ...state.items };
  const itemIds: string[] = [];
  for (const w of wallpapers) {
    if (itemIds.includes(w.id)) continue;
    itemIds.push(w.id);
    items[w.id] ??= w;
  }
  const collection: Collection = { id, name: name.trim() || t('Sans titre'), createdAt: now, itemIds };
  return { ...state, items, collections: [collection, ...state.collections] };
}

export function setSort(state: LibraryData, sort: LibrarySort): LibraryData {
  return LIBRARY_SORTS.includes(sort) ? { ...state, sort } : state;
}
