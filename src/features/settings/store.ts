import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_SOURCES, type SourceToggles } from '@/features/sources/registry';
import type { WallpaperTarget } from '@/shared/native';
import { DEFAULT_SEED } from '@/shared/theme/scheme';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Options avancées : toutes désactivées par défaut, activables dans les réglages. */
export interface FeatureFlags {
  dynamic: boolean;
  live: boolean;
  rotation: boolean;
  places: boolean;
  editor: boolean;
  generator: boolean;
  palette: boolean;
  linked: boolean;
  focus: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export interface Settings {
  themeMode: ThemeMode;
  dynamicColor: boolean;
  seedColor: string;
  gridColumns: 2 | 3;
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
  gridColumns: 2,
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
    places: false,
    editor: false,
    generator: false,
    palette: false,
    linked: false,
    focus: false,
  },
};

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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Fusion profonde : une nouvelle option ajoutée plus tard prend sa valeur par défaut.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Settings>;
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
