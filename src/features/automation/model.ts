import type { LibraryData } from '@/features/library/model';
import type { FeatureFlags } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import type { WallpaperTarget } from '@/shared/native';
import type { AutomationRef, NativeAutomationConfig, QuickPool } from '@/shared/native/automation';
import type { IconName } from '@/shared/ui/icons';

export type DynamicModeKey = 'time' | 'weather' | 'season' | 'battery';
export type SlotKey = 'morning' | 'day' | 'evening' | 'night';
export type WeatherKey = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'night';
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export type BatteryKey = 'high' | 'medium' | 'low' | 'charging';

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

export interface FocusScheduleDraft {
  id: string;
  /** 1 = lundi … 7 = dimanche. */
  days: number[];
  start: string;
  end: string;
}

/** Choix de l'utilisateur ; la configuration native en est dérivée avec les fonds de la bibliothèque. */
export interface AutomationPrefs {
  rotation: { intervalMinutes: number; target: WallpaperTarget; shuffle: boolean; source: string };
  dynamic: {
    mode: DynamicModeKey;
    target: WallpaperTarget;
    slotStarts: Record<SlotKey, string>;
    slots: Partial<Record<SlotKey, string>>;
    place: Place | null;
    weather: Partial<Record<WeatherKey, string>>;
    hemisphere: 'north' | 'south';
    seasons: Partial<Record<SeasonKey, string>>;
    battery: Partial<Record<BatteryKey, string>>;
  };
  focus: { target: WallpaperTarget; wallpaperId: string | null; schedules: FocusScheduleDraft[] };
}

export const FAVORITES_SOURCE = 'favorites';

export const DEFAULT_AUTOMATION: AutomationPrefs = {
  rotation: { intervalMinutes: 60, target: 'both', shuffle: true, source: FAVORITES_SOURCE },
  dynamic: {
    mode: 'time',
    target: 'both',
    slotStarts: { morning: '06:00', day: '10:00', evening: '18:00', night: '22:00' },
    slots: {},
    place: null,
    weather: {},
    hemisphere: 'north',
    seasons: {},
    battery: {},
  },
  focus: {
    target: 'both',
    wallpaperId: null,
    schedules: [{ id: 'travail', days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }],
  },
};

export const TIME_SLOTS: readonly { key: SlotKey; label: string; icon: IconName }[] = [
  { key: 'morning', label: 'Matin', icon: 'twilight' },
  { key: 'day', label: 'Journée', icon: 'sunny' },
  { key: 'evening', label: 'Soirée', icon: 'twilight' },
  { key: 'night', label: 'Nuit', icon: 'night' },
];

export const WEATHER_KINDS: readonly { key: WeatherKey; label: string; icon: IconName }[] = [
  { key: 'clear', label: 'Ensoleillé', icon: 'sunny' },
  { key: 'cloudy', label: 'Nuageux', icon: 'cloud' },
  { key: 'rain', label: 'Pluie', icon: 'rainy' },
  { key: 'snow', label: 'Neige', icon: 'snow' },
  { key: 'storm', label: 'Orage', icon: 'storm' },
  { key: 'fog', label: 'Brouillard', icon: 'foggy' },
  { key: 'night', label: 'Nuit claire', icon: 'night' },
];

export const SEASONS: readonly { key: SeasonKey; label: string; icon: IconName }[] = [
  { key: 'spring', label: 'Printemps', icon: 'eco' },
  { key: 'summer', label: 'Été', icon: 'sunny' },
  { key: 'autumn', label: 'Automne', icon: 'twilight' },
  { key: 'winter', label: 'Hiver', icon: 'snow' },
];

/** Plages [min, max[ ; une plage sans fond ne change rien (et rend le fond habituel en la quittant). */
export const BATTERY_LEVELS: readonly { key: BatteryKey; label: string; min: number | null; max: number; icon: IconName }[] = [
  { key: 'high', label: '50 % et plus', min: 50, max: 101, icon: 'battery' },
  { key: 'medium', label: 'De 20 à 50 %', min: 20, max: 50, icon: 'battery' },
  { key: 'low', label: 'Moins de 20 %', min: 0, max: 20, icon: 'batteryAlert' },
  { key: 'charging', label: 'En charge', min: null, max: 101, icon: 'bolt' },
];

export const DAYS: readonly { value: number; short: string; label: string }[] = [
  { value: 1, short: 'L', label: 'Lundi' },
  { value: 2, short: 'M', label: 'Mardi' },
  { value: 3, short: 'M', label: 'Mercredi' },
  { value: 4, short: 'J', label: 'Jeudi' },
  { value: 5, short: 'V', label: 'Vendredi' },
  { value: 6, short: 'S', label: 'Samedi' },
  { value: 7, short: 'D', label: 'Dimanche' },
];

export const INTERVALS: readonly { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 180, label: '3 h' },
  { minutes: 360, label: '6 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
];

/**
 * Référence native d'un fond : les images distantes passent par leur URL (le natif en garde sa
 * propre copie), les images locales par leur chemin.
 */
export const QUICK_POOL_LIMIT = 300;

/**
 * Fonds envoyés au natif pour la tuile « Fond suivant » et les raccourcis de l'icône : les favoris
 * (les plus récents d'abord) ou, sans favori, les fonds déjà appliqués. Copie hors ligne quand elle
 * existe, pour changer de fond sans réseau.
 */
export function buildQuickPool(
  library: Pick<LibraryData, 'items' | 'favorites' | 'offline' | 'history'>,
  defaultTarget: WallpaperTarget | 'ask',
): QuickPool {
  const favorites = Object.entries(library.favorites)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
  const ids = favorites.length > 0 ? favorites : [...new Set(library.history.map((h) => h.wallpaperId))];
  const items = ids.slice(0, QUICK_POOL_LIMIT).flatMap((id) => {
    const w = library.items[id];
    return w ? [{ id: w.id, uri: library.offline[id]?.fullPath ?? w.full }] : [];
  });
  return { target: defaultTarget === 'ask' ? 'both' : defaultTarget, items };
}

export function toRef(w: Wallpaper): AutomationRef {
  return { id: w.id, uri: w.full };
}

/** Fonds proposés à la rotation : favoris (du plus récent au plus ancien) ou une collection. */
export function rotationItems(source: string, library: Pick<LibraryData, 'items' | 'favorites' | 'collections'>): Wallpaper[] {
  const ids =
    source === FAVORITES_SOURCE
      ? Object.entries(library.favorites)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id)
      : (library.collections.find((c) => c.id === source)?.itemIds ?? []);
  return ids.map((id) => library.items[id]).filter((w): w is Wallpaper => !!w);
}

function refMap<K extends string>(ids: Partial<Record<K, string>>, items: Record<string, Wallpaper>): Partial<Record<K, AutomationRef>> {
  const out: Partial<Record<K, AutomationRef>> = {};
  for (const [key, id] of Object.entries(ids) as [K, string | undefined][]) {
    const w = id ? items[id] : undefined;
    if (w) out[key] = toRef(w);
  }
  return out;
}

/** Configuration envoyée au natif : options désactivées dans les réglages = automatismes coupés. */
export function buildConfig(
  prefs: AutomationPrefs,
  flags: Pick<FeatureFlags, 'rotation' | 'dynamic' | 'focus'>,
  library: Pick<LibraryData, 'items' | 'favorites' | 'collections'>,
): NativeAutomationConfig {
  const { items } = library;
  const d = prefs.dynamic;
  const dynamic: NativeAutomationConfig['dynamic'] = { enabled: flags.dynamic, target: d.target, mode: d.mode };
  switch (d.mode) {
    case 'time':
      dynamic.time = {
        slots: TIME_SLOTS.flatMap(({ key }) => {
          const w = d.slots[key] ? items[d.slots[key] as string] : undefined;
          return w ? [{ start: d.slotStarts[key], item: toRef(w) }] : [];
        }),
      };
      break;
    case 'weather':
      if (d.place) dynamic.weather = { latitude: d.place.latitude, longitude: d.place.longitude, items: refMap(d.weather, items) };
      break;
    case 'season':
      dynamic.season = { hemisphere: d.hemisphere, items: refMap(d.seasons, items) };
      break;
    case 'battery': {
      const refs = refMap(d.battery, items);
      dynamic.battery = {
        levels: BATTERY_LEVELS.flatMap(({ key, min, max }) => {
          const ref = refs[key];
          return min !== null && ref ? [{ min, max, item: ref }] : [];
        }),
        charging: refs.charging,
      };
      break;
    }
  }

  const focusWallpaper = prefs.focus.wallpaperId ? items[prefs.focus.wallpaperId] : undefined;
  return {
    rotation: {
      enabled: flags.rotation,
      intervalMinutes: prefs.rotation.intervalMinutes,
      target: prefs.rotation.target,
      shuffle: prefs.rotation.shuffle,
      items: rotationItems(prefs.rotation.source, library).map(toRef),
    },
    dynamic,
    focus: {
      enabled: flags.focus,
      target: prefs.focus.target,
      item: focusWallpaper ? toRef(focusWallpaper) : undefined,
      schedules: prefs.focus.schedules
        .filter((s) => s.days.length > 0 && s.start !== s.end)
        .map(({ days, start, end }) => ({ days: [...days].sort(), start, end })),
    },
  };
}
