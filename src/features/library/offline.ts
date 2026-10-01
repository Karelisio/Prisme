import { useSettings } from '@/features/settings/store';
import { isLocalWallpaper } from '@/features/sources/device';
import { PrismeWallpaper } from '@/shared/native';
import type { OfflineCopy } from './model';
import { useLibrary } from './store';

let running = false;
let rerun = false;
let timer: number | undefined;

/**
 * Réconcilie les copies locales avec la bibliothèque : miniatures de tout ce qui est référencé,
 * pleine résolution des favoris (si l'option est active), suppression du reste.
 */
export async function syncOffline(): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      await reconcile();
    } while (rerun);
  } finally {
    running = false;
  }
}

async function reconcile() {
  const { items, favorites, offline, setOffline } = useLibrary.getState();
  const keepFull = useSettings.getState().offlineFavorites;
  const online = navigator.onLine;

  for (const [id, copy] of Object.entries(offline)) {
    if (!items[id]) {
      await remove(copy.thumbUrl);
      await remove(copy.fullUrl);
      setOffline(id, null);
    }
  }

  for (const [id, w] of Object.entries(items)) {
    if (isLocalWallpaper(w)) continue;
    const copy: OfflineCopy = { ...useLibrary.getState().offline[id] };
    let changed = false;

    if (!copy.thumbPath && online) {
      const path = await cache(w.thumb);
      if (path) Object.assign(copy, { thumbUrl: w.thumb, thumbPath: path });
      changed ||= !!path;
    }

    const wantsFull = keepFull && !!favorites[id];
    if (wantsFull && !copy.fullPath && online) {
      const path = await cache(w.full);
      if (path) Object.assign(copy, { fullUrl: w.full, fullPath: path });
      changed ||= !!path;
    } else if (!wantsFull && copy.fullPath) {
      await remove(copy.fullUrl);
      delete copy.fullPath;
      delete copy.fullUrl;
      changed = true;
    }

    if (changed && useLibrary.getState().items[id]) setOffline(id, copy);
  }
}

async function cache(url: string): Promise<string | null> {
  try {
    return (await PrismeWallpaper.cacheImage({ url, persistent: true })).path;
  } catch {
    return null;
  }
}

async function remove(url: string | undefined) {
  if (!url) return;
  try {
    await PrismeWallpaper.removeOfflineImage({ url });
  } catch {
    // Fichier déjà absent : rien à faire.
  }
}

/** Lance la synchronisation après chaque modification de la bibliothèque (regroupée) et au retour du réseau. */
export function startOfflineSync(): () => void {
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncOffline(), 800);
  };
  const unsubscribeLibrary = useLibrary.subscribe((state, prev) => {
    if (state.items !== prev.items || state.favorites !== prev.favorites || (state.hydrated && !prev.hydrated)) schedule();
  });
  const unsubscribeSettings = useSettings.subscribe((state, prev) => {
    if (state.offlineFavorites !== prev.offlineFavorites) schedule();
  });
  window.addEventListener('online', schedule);
  if (useLibrary.getState().hydrated) schedule();
  return () => {
    unsubscribeLibrary();
    unsubscribeSettings();
    window.removeEventListener('online', schedule);
    window.clearTimeout(timer);
  };
}
