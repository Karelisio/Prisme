import { type AutomationPrefs, DEFAULT_AUTOMATION } from '@/features/automation/model';
import type { Hidden, HiddenAuthor, HiddenWallpaper } from '@/features/discover/hidden';
import type { Photographer } from '@/features/discover/store';
import { type Collection, HISTORY_LIMIT, type HistoryEntry, type LibraryData, prune } from '@/features/library/model';
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings/store';
import { isLocalWallpaper } from '@/features/sources/device';
import type { Wallpaper } from '@/features/sources/types';

export const BACKUP_FORMAT = 'prisme-backup';
export const BACKUP_VERSION = 1;

export type BackupLibrary = Pick<LibraryData, 'items' | 'favorites' | 'collections' | 'history'>;

/** Découverte : photographes suivis et contenus masqués. */
export interface BackupDiscover extends Hidden {
  following: Photographer[];
}

/** Fichier de sauvegarde : bibliothèque, réglages et automatismes (sans images locales). */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  library: BackupLibrary;
  settings: Partial<Settings>;
  automation: Partial<AutomationPrefs>;
  /** Absent des sauvegardes créées avant la version 0.3. */
  discover?: BackupDiscover;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain => !!value && typeof value === 'object' && !Array.isArray(value);

/** Garde les seules clés connues, avec le type de leur valeur par défaut (objets imbriqués compris). */
function pickLike<T extends Plain>(defaults: T, value: unknown): Partial<T> {
  if (!isPlain(value)) return {};
  const out: Plain = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const v = value[key];
    if (v === undefined) continue;
    if (isPlain(fallback) && isPlain(v)) out[key] = { ...fallback, ...v };
    else if (fallback === null || typeof v === typeof fallback || (Array.isArray(fallback) && Array.isArray(v))) out[key] = v;
  }
  return out as Partial<T>;
}

/**
 * Prépare la sauvegarde. Les images importées et les créations restent en dehors : leurs fichiers
 * ne voyagent pas avec la sauvegarde, une référence vers elles serait cassée.
 */
export function createBackup(
  library: LibraryData,
  settings: Settings,
  automation: AutomationPrefs,
  now: Date,
  appVersion: string,
  discover?: BackupDiscover,
): Backup {
  const local = new Set(Object.values(library.items).filter(isLocalWallpaper).map((w) => w.id));
  const keep = (id: string) => !local.has(id);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    library: {
      items: Object.fromEntries(Object.entries(library.items).filter(([id]) => keep(id))),
      favorites: Object.fromEntries(Object.entries(library.favorites).filter(([id]) => keep(id))),
      collections: library.collections.map((c) => ({ ...c, itemIds: c.itemIds.filter(keep) })),
      // Les images préparées (éditeur, fonds liés) sont des fichiers locaux : on garde le fond source.
      history: library.history.filter((h) => keep(h.wallpaperId)).map(({ uri: _local, ...h }) => h),
    },
    settings: pickLike(DEFAULT_SETTINGS as unknown as Plain, settings) as Partial<Settings>,
    automation: pickLike(DEFAULT_AUTOMATION as unknown as Plain, automation) as Partial<AutomationPrefs>,
    ...(discover && {
      discover: {
        following: discover.following,
        hiddenWords: discover.hiddenWords,
        hiddenAuthors: discover.hiddenAuthors,
        hiddenIds: discover.hiddenIds,
      },
    }),
  };
}

const isPhotographer = (v: unknown): v is Photographer =>
  isPlain(v) && typeof v.username === 'string' && typeof v.name === 'string' && typeof v.url === 'string';

const isHiddenAuthor = (v: unknown): v is HiddenAuthor =>
  isPlain(v) && typeof v.key === 'string' && typeof v.name === 'string' && typeof v.source === 'string' && typeof v.at === 'number';

const isHiddenWallpaper = (v: unknown): v is HiddenWallpaper =>
  isPlain(v) && typeof v.id === 'string' && typeof v.thumb === 'string' && typeof v.alt === 'string' && typeof v.at === 'number';

function parseDiscover(value: unknown): BackupDiscover | undefined {
  if (!isPlain(value)) return undefined;
  const record = <T>(v: unknown, valid: (x: unknown) => x is T, keyOf: (x: T) => string) =>
    Object.fromEntries(Object.entries(isPlain(v) ? v : {}).filter(([k, x]) => valid(x) && keyOf(x) === k)) as Record<string, T>;
  return {
    following: (Array.isArray(value.following) ? value.following : []).filter(isPhotographer),
    hiddenWords: (Array.isArray(value.hiddenWords) ? value.hiddenWords : []).filter((w): w is string => typeof w === 'string' && w.trim() !== ''),
    hiddenAuthors: record(value.hiddenAuthors, isHiddenAuthor, (a) => a.key),
    hiddenIds: record(value.hiddenIds, isHiddenWallpaper, (w) => w.id),
  };
}

/** Réunit les abonnements et contenus masqués (rien n'est retiré). */
export function mergeDiscover(current: BackupDiscover, incoming: BackupDiscover): BackupDiscover {
  const known = new Set(current.following.map((f) => f.username));
  const words = new Set(current.hiddenWords.map((w) => w.toLowerCase()));
  return {
    following: [...current.following, ...incoming.following.filter((f) => !known.has(f.username))],
    hiddenWords: [...current.hiddenWords, ...incoming.hiddenWords.filter((w) => !words.has(w.toLowerCase()))],
    hiddenAuthors: { ...incoming.hiddenAuthors, ...current.hiddenAuthors },
    hiddenIds: { ...incoming.hiddenIds, ...current.hiddenIds },
  };
}

const isWallpaper = (v: unknown): v is Wallpaper =>
  isPlain(v) && typeof v.id === 'string' && typeof v.source === 'string' && typeof v.full === 'string' && typeof v.thumb === 'string';

const isCollection = (v: unknown): v is Collection =>
  isPlain(v) && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.itemIds) && v.itemIds.every((id) => typeof id === 'string');

const isHistoryEntry = (v: unknown): v is HistoryEntry =>
  isPlain(v) && typeof v.id === 'string' && typeof v.wallpaperId === 'string' && typeof v.at === 'number' && ['home', 'lock', 'both'].includes(v.target as string);

/** Lit et valide un fichier de sauvegarde ; les entrées abîmées sont ignorées une à une. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("Ce fichier n'est pas une sauvegarde Prisme");
  }
  if (!isPlain(data) || data.format !== BACKUP_FORMAT) throw new BackupError("Ce fichier n'est pas une sauvegarde Prisme");
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new BackupError('Sauvegarde créée par une version plus récente de Prisme : mets l’app à jour');
  }
  const library = isPlain(data.library) ? data.library : {};
  const items = Object.fromEntries(Object.entries(isPlain(library.items) ? library.items : {}).filter(([id, w]) => isWallpaper(w) && w.id === id)) as Record<
    string,
    Wallpaper
  >;
  const favorites = Object.fromEntries(
    Object.entries(isPlain(library.favorites) ? library.favorites : {}).filter(([id, at]) => typeof at === 'number' && items[id]),
  ) as Record<string, number>;
  const collections = (Array.isArray(library.collections) ? library.collections : [])
    .filter(isCollection)
    .map((c) => ({ ...c, createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0, itemIds: c.itemIds.filter((id) => items[id]) }));
  const history = (Array.isArray(library.history) ? library.history : []).filter((h) => isHistoryEntry(h) && !!items[h.wallpaperId]) as HistoryEntry[];
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    appVersion: typeof data.appVersion === 'string' ? data.appVersion : '',
    library: { items, favorites, collections, history },
    settings: pickLike(DEFAULT_SETTINGS as unknown as Plain, data.settings) as Partial<Settings>,
    automation: pickLike(DEFAULT_AUTOMATION as unknown as Plain, data.automation) as Partial<AutomationPrefs>,
    discover: parseDiscover(data.discover),
  };
}

/** Fusionne sans rien perdre : favoris et collections réunis, historique complété. */
export function mergeLibrary(current: LibraryData, incoming: BackupLibrary): LibraryData {
  const collections = current.collections.map((c) => {
    const other = incoming.collections.find((i) => i.id === c.id);
    return other ? { ...c, itemIds: [...c.itemIds, ...other.itemIds.filter((id) => !c.itemIds.includes(id))] } : c;
  });
  for (const c of incoming.collections) if (!current.collections.some((existing) => existing.id === c.id)) collections.push(c);
  const known = new Set(current.history.map((h) => h.id));
  const history = [...current.history, ...incoming.history.filter((h) => !known.has(h.id))].sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT);
  return prune({
    ...current,
    items: { ...incoming.items, ...current.items },
    favorites: { ...incoming.favorites, ...current.favorites },
    collections,
    history,
  });
}

export function backupFileName(exportedAt: string): string {
  return `prisme-sauvegarde-${exportedAt.slice(0, 10)}.json`;
}
