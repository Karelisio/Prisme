import { App as CapacitorApp } from '@capacitor/app';
import { useDiscover } from '@/features/discover/store';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { usableSources } from '@/features/sources/registry';
import type { Wallpaper } from '@/features/sources/types';
import { env } from '@/shared/config/env';
import { isNative } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { buildConfig, buildQuickPool } from './model';
import type { OnlineContext } from './online';
import { useAutomationPrefs } from './store';

let lastSent = '';
let lastPool = '';
let timer: number | undefined;

/** Favoris pour la tuile et les raccourcis (envoyés seulement s'ils ont changé). */
async function pushQuickPool() {
  const library = useLibrary.getState();
  if (!library.hydrated) return;
  const pool = buildQuickPool(library, useSettings.getState().defaultTarget);
  const json = JSON.stringify(pool);
  if (json === lastPool) return;
  lastPool = json;
  try {
    await PrismeAutomation.setQuickPool(pool);
  } catch {
    lastPool = '';
  }
}

/** Contexte de la rotation en ligne : sources utilisables, clés, contenus masqués, favoris (« Pour toi »). */
function onlineContext(): OnlineContext {
  const library = useLibrary.getState();
  const { hiddenIds, hiddenAuthors, hiddenWords } = useDiscover.getState();
  return {
    sources: usableSources(useSettings.getState().sources),
    keys: { unsplash: env.unsplashKey, pexels: env.pexelsKey },
    hidden: { hiddenIds, hiddenAuthors, hiddenWords },
    favorites: Object.keys(library.favorites).flatMap((id) => (library.items[id] ? [library.items[id]] : [])),
  };
}

async function push() {
  void pushQuickPool();
  const library = useLibrary.getState();
  if (!library.hydrated) return;
  const config = buildConfig(useAutomationPrefs.getState(), useSettings.getState().features, library, onlineContext());
  const json = JSON.stringify(config);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeAutomation.configure({ config });
  } catch {
    lastSent = '';
  }
}

const text = (v: unknown) => typeof v === 'string' && v.length > 0;

function isWallpaper(v: unknown): v is Wallpaper {
  if (!v || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  return text(w.id) && text(w.source) && text(w.thumb) && text(w.full) && typeof w.width === 'number' && typeof w.height === 'number';
}

/** Ajoute à l'historique les fonds appliqués automatiquement pendant que l'app était fermée. */
export async function importAutomationLog() {
  try {
    const { entries } = await PrismeAutomation.drainLog();
    const library = useLibrary.getState();
    for (const entry of entries) {
      // Fond trouvé en ligne par la rotation : décrit par le natif, inconnu de la bibliothèque.
      const wallpaper = library.items[entry.id] ?? (isWallpaper(entry.wallpaper) && entry.wallpaper.id === entry.id ? entry.wallpaper : undefined);
      // « quick » : tuile ou raccourci, un choix de l'utilisateur plutôt qu'un automatisme.
      if (wallpaper) library.addHistory(wallpaper, entry.target, { auto: entry.reason !== 'quick', at: entry.at });
    }
  } catch {
    // Journal indisponible : sans conséquence.
  }
}

/** Envoie la configuration au natif à chaque changement utile (regroupé), et récupère le journal. */
export function startAutomationSync(): () => void {
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void push(), 600);
  };
  const unsubscribers = [
    useAutomationPrefs.subscribe(schedule),
    useSettings.subscribe((s, prev) => {
      if (s.features !== prev.features || s.defaultTarget !== prev.defaultTarget || s.sources !== prev.sources) schedule();
    }),
    useDiscover.subscribe((s, prev) => {
      if (s.hiddenIds !== prev.hiddenIds || s.hiddenAuthors !== prev.hiddenAuthors || s.hiddenWords !== prev.hiddenWords) schedule();
    }),
    useLibrary.subscribe((s, prev) => {
      if (s.hydrated && !prev.hydrated) void importAutomationLog();
      if (
        s.items !== prev.items ||
        s.favorites !== prev.favorites ||
        s.collections !== prev.collections ||
        s.offline !== prev.offline ||
        s.history !== prev.history ||
        s.hydrated !== prev.hydrated
      )
        schedule();
    }),
  ];
  if (useLibrary.getState().hydrated) {
    schedule();
    void importAutomationLog();
  }
  const resume = isNative ? CapacitorApp.addListener('resume', () => void importAutomationLog()) : null;
  return () => {
    unsubscribers.forEach((u) => u());
    void resume?.then((h) => h.remove());
    window.clearTimeout(timer);
  };
}
