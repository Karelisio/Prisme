import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SOURCES, type SourceToggles } from '@/features/sources/registry';
import type { WallpaperTarget } from '@/shared/native';
import { DEFAULT_SEED } from '@/shared/theme/scheme';

/** « black » : thème sombre à fonds noirs purs (écrans OLED). */
export type ThemeMode = 'system' | 'light' | 'dark' | 'black';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark', 'black'];

/**
 * Grille de fonds : 2, 3 ou 4 colonnes égales, ou mosaïque (hauteurs variées selon le format des
 * images). Chaînes plutôt que nombres : les sauvegardes ne gardent que les valeurs du type du défaut.
 */
export type GridLayout = '2' | '3' | '4' | 'mosaic';

export const GRID_LAYOUTS: readonly GridLayout[] = ['2', '3', '4', 'mosaic'];

/** Options avancées : toutes désactivées par défaut, activables dans les réglages. */
export interface FeatureFlags {
  dynamic: boolean;
  live: boolean;
  rotation: boolean;
  music: boolean;
  places: boolean;
  editor: boolean;
  generator: boolean;
  palette: boolean;
  linked: boolean;
  focus: boolean;
  /** Fêtes et dates perso. */
  events: boolean;
  /** Assombrir le soir. */
  dim: boolean;
  /** Citation du jour sur le fond d'écran. */
  quote: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export interface Settings {
  themeMode: ThemeMode;
  dynamicColor: boolean;
  seedColor: string;
  gridLayout: GridLayout;
  dataSaver: boolean;
  sources: SourceToggles;
  /** Écran visé par défaut ; « ask » ouvre le choix à chaque fois. */
  defaultTarget: WallpaperTarget | 'ask';
  /** Garde une copie pleine résolution des favoris pour les appliquer hors ligne. */
  offlineFavorites: boolean;
  /** Sur connexion limitée (données mobiles), images à la taille de l'écran plutôt qu'en HD. */
  hdOnWifiOnly: boolean;
  /** Retours haptiques sur les actions importantes. */
  haptics: boolean;
  /** Recherche automatique des nouvelles versions (releases GitHub). */
  autoUpdateCheck: boolean;
  /** Notification quotidienne « Fond du jour », à l'heure choisie. */
  dailyNotification: boolean;
  dailyHour: number;
  features: FeatureFlags;
}

export const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  dynamicColor: true,
  seedColor: DEFAULT_SEED,
  gridLayout: '2',
  dataSaver: false,
  sources: DEFAULT_SOURCES,
  defaultTarget: 'ask',
  offlineFavorites: true,
  hdOnWifiOnly: false,
  haptics: true,
  autoUpdateCheck: true,
  dailyNotification: false,
  dailyHour: 9,
  features: {
    dynamic: false,
    live: false,
    rotation: false,
    music: false,
    places: false,
    editor: false,
    generator: false,
    palette: false,
    linked: false,
    focus: false,
    events: false,
    dim: false,
    quote: false,
  },
};

/** Version du format enregistré : 2 remplace `gridColumns` (2 ou 3) par `gridLayout`. */
export const SETTINGS_VERSION = 2;

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain => !!value && typeof value === 'object' && !Array.isArray(value);
const isGridLayout = (value: unknown): value is GridLayout => (GRID_LAYOUTS as readonly unknown[]).includes(value);
const isThemeMode = (value: unknown): value is ThemeMode => (THEME_MODES as readonly unknown[]).includes(value);

/**
 * Reprend des réglages enregistrés par une version précédente (ou lus dans une sauvegarde) :
 * l'ancien nombre de colonnes devient la disposition de la grille, et toute valeur inconnue est
 * écartée pour que le réglage retombe sur sa valeur par défaut.
 */
export function migrateSettings(persisted: unknown, version: number): Partial<Settings> {
  const saved: Plain = isPlain(persisted) ? { ...persisted } : {};
  if (version < 2) {
    // Avant la version 2, `gridColumns` était le seul réglage de la grille : s'il figure encore dans le fichier, c'est lui.
    const columns = typeof saved.gridColumns === 'number' ? String(saved.gridColumns) : undefined;
    if (isGridLayout(columns)) saved.gridLayout = columns;
  }
  delete saved.gridColumns;
  if (!isGridLayout(saved.gridLayout)) delete saved.gridLayout;
  if (!isThemeMode(saved.themeMode)) delete saved.themeMode;
  return saved as Partial<Settings>;
}

interface SettingsActions {
  update: (patch: Partial<Settings>) => void;
  setFeature: (feature: FeatureKey, enabled: boolean) => void;
  reset: () => void;
}

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setFeature: (feature, enabled) => set((s) => ({ features: { ...s.features, [feature]: enabled } })),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'prisme-settings',
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => migrateSettings(persisted, version) as Settings & SettingsActions,
      // Fusion profonde : une nouvelle option ajoutée plus tard prend sa valeur par défaut.
      merge: (persisted, current) => {
        // Les valeurs inconnues sont écartées ici aussi (réglages modifiés à la main, version plus récente).
        const saved = migrateSettings(persisted, SETTINGS_VERSION);
        return {
          ...current,
          ...saved,
          sources: { ...current.sources, ...saved.sources },
          features: { ...current.features, ...saved.features },
        };
      },
    },
  ),
);
