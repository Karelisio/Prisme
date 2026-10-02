import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { NormalizedRect, WallpaperTarget } from './definitions';

/** Image d'un automatisme : URL distante ou chemin local, recadrage facultatif. */
export interface AutomationRef {
  id: string;
  uri: string;
  crop?: NormalizedRect;
}

/** Requête d'une source pour la rotation en ligne (le natif tire les fonds au hasard). */
export interface NativeOnlineQuery {
  provider: 'unsplash' | 'pexels' | 'wallhaven' | 'nasa' | 'art';
  query?: string;
  /** Unsplash : photos de ce photographe. */
  username?: string;
  /** Wallhaven : catégories (« 100 » = général). */
  categories?: string;
  /** En-tête Authorization (Unsplash, Pexels). */
  auth?: string;
}

export interface NativeOnlineConfig {
  /** Change avec le thème : le natif repart d'une file vide et change de fond tout de suite. */
  key: string;
  queries: NativeOnlineQuery[];
  wifiOnly: boolean;
  /** Contenus masqués dans l'app. */
  exclude: { ids: string[]; authors: string[]; words: string[] };
}

export interface NativeAutomationConfig {
  rotation: {
    enabled: boolean;
    intervalMinutes: number;
    target: WallpaperTarget;
    shuffle: boolean;
    items: AutomationRef[];
    /** Fonds pris au hasard en ligne (remplace `items`). */
    online?: NativeOnlineConfig;
  };
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
  /** « quick » : tuile ou raccourci de l'icône (choix de l'utilisateur, pas un automatisme). */
  reason: 'focus' | 'event' | 'place' | 'dynamic' | 'rotation' | 'restore' | 'quick';
  /** Fond trouvé en ligne par la rotation : sa description complète (forme `Wallpaper`). */
  wallpaper?: unknown;
}

export interface AutomationStatus {
  enabled: boolean;
  focusActive: boolean;
  appliedHome?: string;
  appliedLock?: string;
  lastRotationAt: number;
  /** Dernière évaluation des automatismes (0 : jamais). */
  lastRunAt?: number;
  /** Fonds disponibles pour la tuile « Fond suivant ». */
  quickPoolSize?: number;
}

export interface PrismeAutomationPlugin {
  configure(options: { config: NativeAutomationConfig }): Promise<{ enabled: boolean }>;
  getStatus(): Promise<AutomationStatus>;
  drainLog(): Promise<{ entries: AutomationLogEntry[] }>;
  runNow(): Promise<void>;
  /** Passe tout de suite au fond suivant de la rotation. */
  nextRotation(): Promise<void>;
  getApproximateLocation(): Promise<{ latitude: number; longitude: number }>;
  /** Favoris utilisables par la tuile et les raccourcis « Fond suivant » / « Favori au hasard ». */
  setQuickPool(pool: QuickPool): Promise<void>;
}

export interface QuickPool {
  target: WallpaperTarget;
  items: AutomationRef[];
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
    const rotation = c.rotation.enabled && (c.rotation.items.length > 0 || !!c.rotation.online);
    return { enabled: rotation || c.dynamic.enabled || (c.focus.enabled && !!c.focus.item) };
  }

  async getStatus(): Promise<AutomationStatus> {
    return { enabled: !!this.config, focusActive: false, lastRotationAt: 0, lastRunAt: 0, quickPoolSize: this.quickPool?.items.length ?? 0 };
  }

  /** Tests : entrées que le prochain `drainLog` renverra (fonds appliqués app fermée). */
  pendingLog: AutomationLogEntry[] = window.__prismeAutomationPendingLog ?? [];

  async drainLog() {
    const entries = this.pendingLog;
    this.pendingLog = [];
    return { entries };
  }

  async runNow() {
    this.runs++;
  }

  rotations = 0;

  async nextRotation() {
    this.rotations++;
  }

  quickPool: QuickPool | null = null;

  async setQuickPool(pool: QuickPool) {
    this.quickPool = pool;
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

// Instances web uniques : Capacitor peut appeler ces chargeurs pour plusieurs appels simultanés.
let automationWeb: PrismeAutomationWeb | undefined;
let liveWeb: PrismeLiveWeb | undefined;

export const PrismeAutomation = registerPlugin<PrismeAutomationPlugin>('PrismeAutomation', {
  web: () => (automationWeb ??= new PrismeAutomationWeb()),
});

declare global {
  interface Window {
    __prismeAutomationWeb?: PrismeAutomationWeb;
    /** Tests : journal natif simulé, lu au premier `drainLog`. */
    __prismeAutomationPendingLog?: AutomationLogEntry[];
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
  web: () => (liveWeb ??= new PrismeLiveWeb()),
});
