import type { PluginListenerHandle } from '@capacitor/core';

/** Écran(s) visé(s) par un changement de fond d'écran. */
export type WallpaperTarget = 'home' | 'lock' | 'both';

/** Zone de recadrage normalisée (0..1) par rapport à l'image source. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Capabilities {
  supported: boolean;
  settable: boolean;
  lockScreen: boolean;
  liveWallpaper: boolean;
  dynamicColor: boolean;
  sdkInt: number;
  manufacturer: string;
  model: string;
}

/** Taille physique de l'écran en pixels, en portrait. */
export interface ScreenInfo {
  width: number;
  height: number;
  density: number;
}

/** Tons d'une palette Material You : clé "0".."1000" (convention Android) → "#RRGGBB". */
export type TonalPalette = Record<string, string>;

export type SystemPaletteName = 'accent1' | 'accent2' | 'accent3' | 'neutral1' | 'neutral2';

export interface SystemTheme {
  isDark: boolean;
  sdkInt: number;
  /** Android 12+ : palettes tonales du système. */
  palettes?: Record<SystemPaletteName, TonalPalette>;
  /** Android 14+ : rôles de couleur exacts (primary, onPrimary, surfaceContainer…). */
  roles?: { light: Record<string, string>; dark: Record<string, string> };
}

export interface SetWallpaperOptions {
  /** URL https, chemin absolu local ou URL locale Capacitor. */
  uri: string;
  target: WallpaperTarget;
  crop?: NormalizedRect;
  /** Identifiant repris dans les événements de progression. */
  id?: string;
}

export interface SetWallpaperResult {
  target: WallpaperTarget;
  width: number;
  height: number;
}

export interface LocalImage {
  path: string;
  /** Miniature (~400 px de large) pour les grilles. */
  thumbPath: string;
  width: number;
  height: number;
}

export type PickImageResult = ({ cancelled: false } & LocalImage) | { cancelled: true };

export interface ApplyProgressEvent {
  id: string;
  progress: number;
}

export interface PrismeWallpaperPlugin {
  getCapabilities(): Promise<Capabilities>;
  getScreenInfo(): Promise<ScreenInfo>;
  getSystemTheme(): Promise<SystemTheme>;
  setWallpaper(options: SetWallpaperOptions): Promise<SetWallpaperResult>;
  /** Télécharge une image dans le cache (ou le stockage hors ligne si `persistent`). */
  cacheImage(options: { url: string; persistent?: boolean }): Promise<{ path: string }>;
  removeOfflineImage(options: { url: string }): Promise<{ removed: boolean }>;
  /** Enregistre une image base64 (data URL acceptée) dans les créations de l'app. */
  saveImage(options: { data: string; name?: string }): Promise<LocalImage>;
  deleteLocalImage(options: { path: string }): Promise<{ deleted: boolean }>;
  /** Ouvre le sélecteur de photos du système et importe l'image choisie. */
  pickImage(): Promise<PickImageResult>;
  getCacheInfo(): Promise<{ cacheBytes: number; offlineBytes: number }>;
  clearCache(options?: { includeOffline?: boolean }): Promise<void>;
  addListener(event: 'systemThemeChanged', listener: (theme: SystemTheme) => void): Promise<PluginListenerHandle>;
  addListener(event: 'applyProgress', listener: (event: ApplyProgressEvent) => void): Promise<PluginListenerHandle>;
}
