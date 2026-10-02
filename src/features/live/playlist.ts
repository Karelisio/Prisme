import { FAVORITES_SOURCE, rotationItems } from '@/features/automation/model';
import type { LibraryData } from '@/features/library/model';
import type { Wallpaper } from '@/features/sources/types';
import type { LivePlaylist } from '@/shared/native/automation';

/** Choix de l'utilisateur pour « Changer à chaque déverrouillage » ; la liste envoyée au natif en est dérivée. */
export interface UnlockPrefs {
  enabled: boolean;
  /** Déverrouillages entre deux changements d'image. */
  every: number;
  /** « favorites » ou l'identifiant d'une collection, comme pour la rotation. */
  source: string;
}

export const DEFAULT_UNLOCK: UnlockPrefs = { enabled: false, every: 1, source: FAVORITES_SOURCE };

/** Libellés en français (données) : `t(label)` à l'affichage. */
export const UNLOCK_FREQUENCIES: readonly { every: number; label: string }[] = [
  { every: 1, label: 'Chaque fois' },
  { every: 3, label: '3' },
  { every: 5, label: '5' },
  { every: 10, label: '10' },
];

/** Fonds envoyés au natif au maximum : chacun est préparé et gardé sur l'appareil (environ 1 Mo). */
export const PLAYLIST_LIMIT = 50;

/** Rien à changer : option coupée, ou moins de deux fonds. */
export const PLAYLIST_OFF: LivePlaylist = { enabled: false, every: 1, items: [] };

/**
 * Liste envoyée au natif : les fonds de la source choisie (les plus récents d'abord pour les favoris),
 * avec leur URI d'application (copie hors ligne si elle existe). Elle sert au changement à chaque
 * déverrouillage et au double-tap ([doubleTap]). Il en faut au moins deux : sinon l'image ne pourrait
 * pas changer, et rien n'est envoyé.
 */
export function buildPlaylist(
  prefs: UnlockPrefs,
  optionOn: boolean,
  library: Pick<LibraryData, 'items' | 'favorites' | 'collections'>,
  uriFor: (w: Wallpaper) => string,
  doubleTap = false,
): LivePlaylist {
  if (!optionOn || !(prefs.enabled || doubleTap)) return PLAYLIST_OFF;
  const items = rotationItems(prefs.source, library)
    .slice(0, PLAYLIST_LIMIT)
    .map((w) => ({ id: w.id, uri: uriFor(w) }));
  if (items.length < 2) return PLAYLIST_OFF;
  return prefs.enabled ? { enabled: true, every: prefs.every, items } : { enabled: true, every: prefs.every, items, unlock: false };
}
