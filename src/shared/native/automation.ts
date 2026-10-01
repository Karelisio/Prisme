import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { NormalizedRect, WallpaperTarget } from './definitions';

/** Image d'un automatisme : URL distante ou chemin local, recadrage facultatif. */
export interface AutomationRef {
  id: string;
  uri: string;
  crop?: NormalizedRect;
}

export interface NativeAutomationConfig {
  rotation: { enabled: boolean; intervalMinutes: number; target: WallpaperTarget; shuffle: boolean; items: AutomationRef[] };
  dynamic: {
    enabled: boolean;
    target: WallpaperTarget;
    mode: 'time' | 'weather' | 'season' | 'battery';
    time?: { slots: { start: string; item: AutomationRef }[] };
    weather?: { latitude: number; longitude: number; items: Partial<Record<string, AutomationRef>> };
    season?: { hemisphere: 'north' | 'south'; items: Partial<Record<string, AutomationRef>> };
    battery?: { levels: { min: number; max: number; item: AutomationRef }[]; charging?: AutomationRef };
  };
  focus: {
    enabled: boolean;
    target: WallpaperTarget;
    item?: AutomationRef;
    schedules: { days: number[]; start: string; end: string }[];
  };
}

export interface AutomationLogEntry {
  id: string;
  target: WallpaperTarget;
  at: number;
  reason: 'focus' | 'dynamic' | 'rotation' | 'restore';
}

export interface AutomationStatus {
  enabled: boolean;
  focusActive: boolean;
  appliedHome?: string;
  appliedLock?: string;
  lastRotationAt: number;
}

export interface PrismeAutomationPlugin {
  configure(options: { config: NativeAutomationConfig }): Promise<{ enabled: boolean }>;
  getStatus(): Promise<AutomationStatus>;
  drainLog(): Promise<{ entries: AutomationLogEntry[] }>;
  runNow(): Promise<void>;
  /** Passe tout de suite au fond suivant de la rotation. */
  nextRotation(): Promise<void>;
  getApproximateLocation(): Promise<{ latitude: number; longitude: number }>;
}

/** Navigateur : la configuration est gardée pour les tests, rien ne s'exécute en arrière-plan. */
export class PrismeAutomationWeb extends WebPlugin implements PrismeAutomationPlugin {
  config: NativeAutomationConfig | null = null;
  runs = 0;

  constructor() {
    super();
    window.__prismeAutomationWeb = this;
  }

  async configure(options: { config: NativeAutomationConfig }) {
    this.config = options.config;
    const c = options.config;
    return { enabled: (c.rotation.enabled && c.rotation.items.length > 0) || c.dynamic.enabled || (c.focus.enabled && !!c.focus.item) };
  }

  async getStatus(): Promise<AutomationStatus> {
    return { enabled: !!this.config, focusActive: false, lastRotationAt: 0 };
  }

  async drainLog() {
    return { entries: [] };
  }

  async runNow() {
    this.runs++;
  }

  rotations = 0;

  async nextRotation() {
    this.rotations++;
  }

  getApproximateLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(this.unavailable('Géolocalisation indisponible'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => reject(new Error('Position introuvable')),
        { maximumAge: 6 * 3600_000, timeout: 15_000 },
      );
    });
  }
}

export const PrismeAutomation = registerPlugin<PrismeAutomationPlugin>('PrismeAutomation', {
  web: () => new PrismeAutomationWeb(),
});

declare global {
  interface Window {
    __prismeAutomationWeb?: PrismeAutomationWeb;
    __prismeLiveWeb?: PrismeLiveWeb;
  }
}

export interface PrismeLivePlugin {
  setLiveWallpaper(options: { uri: string; intensity: number; crop?: NormalizedRect }): Promise<{ status: 'launched' | 'updated' }>;
  getStatus(): Promise<{ active: boolean; intensity: number; configured: boolean }>;
}

export class PrismeLiveWeb extends WebPlugin implements PrismeLivePlugin {
  calls: { uri: string; intensity: number; crop?: NormalizedRect }[] = [];

  constructor() {
    super();
    window.__prismeLiveWeb = this;
  }

  async setLiveWallpaper(options: { uri: string; intensity: number; crop?: NormalizedRect }) {
    this.calls.push(options);
    return { status: 'launched' as const };
  }

  async getStatus() {
    return { active: this.calls.length > 0, intensity: this.calls.at(-1)?.intensity ?? 0.5, configured: this.calls.length > 0 };
  }
}

export const PrismeLive = registerPlugin<PrismeLivePlugin>('PrismeLive', {
  web: () => new PrismeLiveWeb(),
});
