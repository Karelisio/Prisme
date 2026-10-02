import { App as CapacitorApp } from '@capacitor/app';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { isNative } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { buildConfig, buildQuickPool } from './model';
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

async function push() {
  void pushQuickPool();
  const library = useLibrary.getState();
  if (!library.hydrated) return;
  const config = buildConfig(useAutomationPrefs.getState(), useSettings.getState().features, library);
  const json = JSON.stringify(config);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeAutomation.configure({ config });
  } catch {
    lastSent = '';
  }
}

/** Ajoute à l'historique les fonds appliqués automatiquement pendant que l'app était fermée. */
export async function importAutomationLog() {
  try {
    const { entries } = await PrismeAutomation.drainLog();
    const library = useLibrary.getState();
    for (const entry of entries) {
      const wallpaper = library.items[entry.id];
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
      if (s.features !== prev.features || s.defaultTarget !== prev.defaultTarget) schedule();
    }),
    useLibrary.subscribe((s, prev) => {
      if (s.hydrated && !prev.hydrated) void importAutomationLog();
      if (
        s.items !== prev.items ||
        s.favorites !== prev.favorites ||
        s.collections !== prev.collections ||
        s.offline !== prev.offline ||
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
