import type { Wallpaper } from '@/features/sources/types';
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

export interface LibraryData {
  /** Catalogue des fonds référencés par les favoris, collections ou l'historique. */
  items: Record<string, Wallpaper>;
  favorites: Record<string, number>;
  collections: Collection[];
  history: HistoryEntry[];
  offline: Record<string, OfflineCopy>;
}

export const EMPTY_LIBRARY: LibraryData = { items: {}, favorites: {}, collections: [], history: [], offline: {} };
export const HISTORY_LIMIT = 200;

export function referencedIds(state: LibraryData): Set<string> {
  const ids = new Set(Object.keys(state.favorites));
  for (const c of state.collections) for (const id of c.itemIds) ids.add(id);
  for (const h of state.history) ids.add(h.wallpaperId);
  return ids;
}

/** Retire du catalogue les fonds qui ne sont plus référencés nulle part. */
export function prune(state: LibraryData): LibraryData {
  const keep = referencedIds(state);
  const items: Record<string, Wallpaper> = {};
  for (const [id, w] of Object.entries(state.items)) if (keep.has(id)) items[id] = w;
  return { ...state, items };
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
  const collection: Collection = { id, name: name.trim() || 'Sans titre', createdAt: now, itemIds: first ? [first.id] : [] };
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
