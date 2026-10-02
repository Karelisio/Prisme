import type { LibraryData } from '@/features/library/model';
import type { FeatureFlags } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import type { WallpaperTarget } from '@/shared/native';
import type { AutomationRef, NativeAutomationConfig, QuickPool } from '@/shared/native/automation';
import type { IconName } from '@/shared/ui/icons';
import { searchFeed } from '@/features/browse/categories';
import { type CustomDate, HOLIDAYS, type HolidayKey, eventDates } from './events';
import { DEFAULT_ONLINE, ONLINE_SOURCE, type OnlineContext, type OnlineRotationPrefs, onlineConfig, onlineQueries } from './online';

export type DynamicModeKey = 'time' | 'weather' | 'season' | 'battery' | 'theme';
export type SlotKey = 'morning' | 'day' | 'evening' | 'night';
export type WeatherKey = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm' | 'fog' | 'night';
export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export type BatteryKey = 'high' | 'medium' | 'low' | 'charging';

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

/** « Selon le lieu » : zone circulaire autour d'un point, avec le fond posé quand l'appareil s'y trouve. */
export interface PlaceZone extends Place {
  id: string;
  /** Rayon en mètres. */
  radius: number;
  wallpaperId: string | null;
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
  /** `source` : « online » (au hasard en ligne), « favorites » ou l'identifiant d'une collection. */
  rotation: {
    intervalMinutes: number;
    target: WallpaperTarget;
    shuffle: boolean;
    /** Rotation intelligente : pas de répétition, teintes variées, fonds sombres la nuit. */
    smart: boolean;
    source: string;
    online: OnlineRotationPrefs;
    /** Source « dossier » : dossier du téléphone choisi avec le sélecteur du système. */
    folder?: { uri: string; name: string };
  };
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
    /** Créneaux horaires calés sur le lever et le coucher du soleil du lieu choisi. */
    followSun: boolean;
    /** Mode sombre du système : un fond clair, un fond sombre. */
    theme: { light?: string; dark?: string };
  };
  /** Le premier lieu de la liste qui contient la position de l'appareil l'emporte. */
  places: { target: WallpaperTarget; items: PlaceZone[] };
  focus: { target: WallpaperTarget; wallpaperId: string | null; schedules: FocusScheduleDraft[] };
  /** « Assombrir le soir » : intensité maximale, lieu dont le soleil cale l'assombrissement. */
  dim: { strength: DimStrength; place: Place | null };
  /** Fêtes (activées par défaut) et dates perso ; sans fond choisi, un fond du thème est pris en ligne. */
  events: {
    target: WallpaperTarget;
    holidays: Partial<Record<HolidayKey, { enabled: boolean; wallpaperId?: string }>>;
    custom: CustomDate[];
  };
}

export const FAVORITES_SOURCE = 'favorites';
export const FOLDER_SOURCE = 'folder';

export const DEFAULT_AUTOMATION: AutomationPrefs = {
  rotation: { intervalMinutes: 60, target: 'both', shuffle: true, smart: true, source: ONLINE_SOURCE, online: DEFAULT_ONLINE },
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
    followSun: false,
    theme: {},
  },
  events: { target: 'both', holidays: {}, custom: [] },
  dim: { strength: 'medium', place: null },
  places: { target: 'both', items: [] },
  focus: {
    target: 'both',
    wallpaperId: null,
    schedules: [{ id: 'travail', days: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }],
  },
};

export type DimStrength = 'light' | 'medium' | 'strong';

export const DIM_STRENGTHS: readonly { value: DimStrength; label: string; max: number }[] = [
  { value: 'light', label: 'Léger', max: 0.25 },
  { value: 'medium', label: 'Moyen', max: 0.4 },
  { value: 'strong', label: 'Fort', max: 0.55 },
];

/** « Suivre le soleil » : début de chaque créneau par rapport au lever ou au coucher. */
export const SUN_ANCHORS: Record<SlotKey, { anchor: 'sunrise' | 'sunset'; offset: number; label: string }> = {
  morning: { anchor: 'sunrise', offset: -30, label: '30 min avant le lever du soleil' },
  day: { anchor: 'sunrise', offset: 90, label: '1 h 30 après le lever du soleil' },
  evening: { anchor: 'sunset', offset: -60, label: '1 h avant le coucher du soleil' },
  night: { anchor: 'sunset', offset: 40, label: '40 min après le coucher du soleil' },
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

/** Rayons proposés pour un lieu, en mètres. */
export const PLACE_RADII: readonly { meters: number; label: string }[] = [
  { meters: 150, label: '150 m' },
  { meters: 300, label: '300 m' },
  { meters: 600, label: '600 m' },
  { meters: 1000, label: '1 km' },
];

export const DEFAULT_PLACE_RADIUS = 300;

/** Noms proposés à l'ajout d'un lieu. */
export const PLACE_SUGGESTIONS: readonly string[] = ['Maison', 'Travail', 'École', 'Famille'];

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

/**
 * Configuration envoyée au natif : options désactivées dans les réglages = automatismes coupés.
 * La rotation en ligne a besoin du contexte (sources utilisables, clés, contenus masqués).
 */
export function buildConfig(
  prefs: AutomationPrefs,
  flags: Pick<FeatureFlags, 'rotation' | 'dynamic' | 'focus'> & Partial<Pick<FeatureFlags, 'events' | 'dim' | 'places'>>,
  library: Pick<LibraryData, 'items' | 'favorites' | 'collections'>,
  online?: OnlineContext,
  now = new Date(),
): NativeAutomationConfig {
  const { items } = library;
  const d = { ...DEFAULT_AUTOMATION.dynamic, ...prefs.dynamic };
  const dynamic: NativeAutomationConfig['dynamic'] = { enabled: flags.dynamic, target: d.target, mode: d.mode };
  switch (d.mode) {
    case 'time': {
      const sun = d.followSun && d.place ? { latitude: d.place.latitude, longitude: d.place.longitude } : undefined;
      dynamic.time = {
        slots: TIME_SLOTS.flatMap(({ key }) => {
          const w = d.slots[key] ? items[d.slots[key] as string] : undefined;
          if (!w) return [];
          const anchor = sun ? { anchor: SUN_ANCHORS[key].anchor, offset: SUN_ANCHORS[key].offset } : {};
          return [{ start: d.slotStarts[key], item: toRef(w), ...anchor }];
        }),
        ...(sun && { sun }),
      };
      break;
    }
    case 'theme': {
      const light = d.theme.light ? items[d.theme.light] : undefined;
      const dark = d.theme.dark ? items[d.theme.dark] : undefined;
      dynamic.theme = { ...(light && { light: toRef(light) }), ...(dark && { dark: toRef(dark) }) };
      break;
    }
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
  const events = buildEvents({ ...DEFAULT_AUTOMATION.events, ...prefs.events }, !!flags.events, items, online, now);
  const dimPrefs = { ...DEFAULT_AUTOMATION.dim, ...prefs.dim };
  const dimPlace = dimPrefs.place ?? d.place;
  const isOnline = prefs.rotation.source === ONLINE_SOURCE;
  const folder = prefs.rotation.source === FOLDER_SOURCE ? prefs.rotation.folder?.uri : undefined;
  const onlineRotation = isOnline && online ? onlineConfig({ ...DEFAULT_ONLINE, ...prefs.rotation.online }, online) : undefined;
  return {
    rotation: {
      enabled: flags.rotation,
      intervalMinutes: prefs.rotation.intervalMinutes,
      target: prefs.rotation.target,
      shuffle: prefs.rotation.shuffle,
      items: isOnline || folder ? [] : rotationItems(prefs.rotation.source, library).map((w) => ({ ...toRef(w), color: w.color })),
      ...(onlineRotation && { online: onlineRotation }),
      ...(folder && { folder }),
      smart: prefs.rotation.smart !== false,
    },
    dynamic,
    places: {
      enabled: flags.places === true,
      target: prefs.places.target,
      // Un lieu sans fond (ou dont le fond a disparu de la bibliothèque) est ignoré.
      items: prefs.places.items.flatMap(({ name, latitude, longitude, radius, wallpaperId }) => {
        const w = wallpaperId ? items[wallpaperId] : undefined;
        const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && radius > 0;
        return w && valid ? [{ name, latitude, longitude, radius, item: toRef(w) }] : [];
      }),
    },
    focus: {
      enabled: flags.focus,
      target: prefs.focus.target,
      item: focusWallpaper ? toRef(focusWallpaper) : undefined,
      schedules: prefs.focus.schedules
        .filter((s) => s.days.length > 0 && s.start !== s.end)
        .map(({ days, start, end }) => ({ days: [...days].sort(), start, end })),
    },
    events,
    dim: {
      enabled: !!flags.dim,
      max: DIM_STRENGTHS.find((s) => s.value === dimPrefs.strength)?.max ?? 0.4,
      ...(dimPlace && { sun: { latitude: dimPlace.latitude, longitude: dimPlace.longitude } }),
    },
  };
}

/** Fêtes et dates perso : dates de cette année et de la suivante, fond choisi ou thème en ligne. */
function buildEvents(
  prefs: AutomationPrefs['events'],
  enabled: boolean,
  items: Record<string, Wallpaper>,
  online: OnlineContext | undefined,
  now: Date,
): NativeAutomationConfig['events'] {
  const themed = (query: string) => (online && query.trim() ? onlineQueries(searchFeed(query.trim()), online) : []);
  const entry = (id: string, name: string, dates: string[], wallpaperId: string | undefined, query: string) => {
    const w = wallpaperId ? items[wallpaperId] : undefined;
    const queries = w ? [] : themed(query);
    return w || queries.length > 0 ? [{ id, name, dates, ...(w ? { item: toRef(w) } : { queries }) }] : [];
  };
  // Dates perso d'abord : un anniversaire passe avant une fête le même jour.
  const custom = prefs.custom.flatMap((c) =>
    entry(`custom:${c.id}`, c.name, eventDates(() => [[c.month, c.day]], now), c.wallpaperId, c.keyword || 'celebration'),
  );
  const holidays = HOLIDAYS.filter((h) => prefs.holidays[h.key]?.enabled !== false).flatMap((h) =>
    entry(h.key, h.label, eventDates(h.days, now), prefs.holidays[h.key]?.wallpaperId, h.query),
  );
  return { enabled, target: prefs.target, items: [...custom, ...holidays] };
}
