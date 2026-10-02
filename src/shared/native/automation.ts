import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { NormalizedRect, WallpaperTarget } from './definitions';

/** Image d'un automatisme : URL distante ou chemin local, recadrage facultatif. */
export interface AutomationRef {
  id: string;
  uri: string;
  crop?: NormalizedRect;
  /** Couleur moyenne « #rrggbb » (rotation intelligente). */
  color?: string;
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
    /** Pas de répétition avant d'avoir tout vu, teintes variées, fonds sombres la nuit. */
    smart?: boolean;
    /** Dossier du téléphone (URI d'arborescence) : ses photos, relues à chaque passage, remplacent `items`. */
    folder?: string;
  };
  dynamic: {
    enabled: boolean;
    target: WallpaperTarget;
    mode: 'time' | 'weather' | 'season' | 'battery' | 'theme';
    /** Avec `sun`, les créneaux ancrés commencent à `offset` minutes du lever ou du coucher du soleil. */
    time?: {
      slots: { start: string; item: AutomationRef; anchor?: 'sunrise' | 'sunset'; offset?: number }[];
      sun?: { latitude: number; longitude: number };
    };
    theme?: { light?: AutomationRef; dark?: AutomationRef };
    weather?: { latitude: number; longitude: number; items: Partial<Record<string, AutomationRef>> };
    season?: { hemisphere: 'north' | 'south'; items: Partial<Record<string, AutomationRef>> };
    battery?: { levels: { min: number; max: number; item: AutomationRef }[]; charging?: AutomationRef };
  };
  /** « Selon le lieu » : zones circulaires (rayon en mètres) avec leur fond ; les lieux sans fond ne sont pas envoyés. */
  places: {
    enabled: boolean;
    target: WallpaperTarget;
    items: { name: string; latitude: number; longitude: number; radius: number; item: AutomationRef }[];
  };
  focus: {
    enabled: boolean;
    target: WallpaperTarget;
    item?: AutomationRef;
    schedules: { days: number[]; start: string; end: string }[];
  };
  /** « Assombrir le soir » : voile progressif (jusqu'à `max`) calé sur le soleil de `sun`. */
  dim?: { enabled: boolean; max: number; sun?: { latitude: number; longitude: number } };
  /** Fêtes et dates perso : jours « AAAA-MM-JJ », fond choisi ou requêtes en ligne. */
  events?: {
    enabled: boolean;
    target: WallpaperTarget;
    items: { id: string; name: string; dates: string[]; item?: AutomationRef; queries?: NativeOnlineQuery[] }[];
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

/** Position de l'appareil ; `accuracy` : précision estimée, en mètres. */
export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationPermissions {
  /** Position précise accordée. */
  precise: boolean;
  /** « Toujours autoriser » (Android 10+) : la position est lue app fermée ; vrai d'office avant Android 10. */
  background: boolean;
}

export interface LocationPermissionResult extends LocationPermissions {
  /** Les réglages de l'app ont été ouverts : à partir d'Android 11, l'accès « Toujours » s'y accorde. */
  settingsOpened: boolean;
  /** Consigne à montrer quand l'utilisateur doit terminer dans les réglages. */
  message?: string;
}

export interface PrismeAutomationPlugin {
  configure(options: { config: NativeAutomationConfig }): Promise<{ enabled: boolean }>;
  getStatus(): Promise<AutomationStatus>;
  drainLog(): Promise<{ entries: AutomationLogEntry[] }>;
  runNow(): Promise<void>;
  /** Passe tout de suite au fond suivant de la rotation. */
  nextRotation(): Promise<void>;
  getApproximateLocation(): Promise<{ latitude: number; longitude: number }>;
  /** Position précise (ajout d'un lieu) : demande l'autorisation au besoin, échoue au bout d'environ 20 s. */
  getCurrentPosition(): Promise<DevicePosition>;
  getLocationPermissions(): Promise<LocationPermissions>;
  /** Position précise d'abord, puis (Android 10+) accès « Toujours » ; à partir d'Android 11, ouvre les réglages de l'app. */
  requestLocationPermissions(): Promise<LocationPermissionResult>;
  /** Favoris utilisables par la tuile et les raccourcis « Fond suivant » / « Favori au hasard ». */
  setQuickPool(pool: QuickPool): Promise<void>;
  /** Sélecteur de dossier du système (accès en lecture conservé). */
  pickFolder(): Promise<{ cancelled: true } | { cancelled: false; uri: string; name: string; count: number }>;
  getFolderInfo(options: { uri: string }): Promise<{ accessible: boolean; name: string; count: number }>;
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
    const rotation = c.rotation.enabled && (c.rotation.items.length > 0 || !!c.rotation.online || !!c.rotation.folder);
    const events = !!c.events?.enabled && c.events.items.length > 0;
    const places = !!c.places?.enabled && c.places.items.length > 0;
    return { enabled: rotation || events || places || !!c.dim?.enabled || c.dynamic.enabled || (c.focus.enabled && !!c.focus.item) };
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

  /** Tests : dossier renvoyé par le prochain `pickFolder` (null = annulé). */
  nextFolder: { uri: string; name: string; count: number } | null = { uri: 'content://test/tree/Camera', name: 'Camera', count: 12 };

  async pickFolder() {
    const folder = this.nextFolder;
    return folder ? { cancelled: false as const, ...folder } : { cancelled: true as const };
  }

  async getFolderInfo(options: { uri: string }) {
    const folder = this.nextFolder;
    return folder && folder.uri === options.uri ? { accessible: true, name: folder.name, count: folder.count } : { accessible: false, name: '', count: 0 };
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

  /** Tests : position renvoyée par `getCurrentPosition` (null : introuvable). */
  position: DevicePosition | null = { latitude: 48.8566, longitude: 2.3522, accuracy: 25 };
  /** Tests : autorisations de position ; rien n'est accordé au départ, comme sur un appareil neuf. */
  locationPermissions: LocationPermissions = { precise: false, background: false };
  /** Tests : false simule un refus à la prochaine demande d'autorisation. */
  grantLocation = true;
  locationRequests = 0;

  async getCurrentPosition(): Promise<DevicePosition> {
    if (!this.locationPermissions.precise) {
      this.locationRequests++;
      if (this.grantLocation) this.locationPermissions = { ...this.locationPermissions, precise: true };
    }
    if (!this.locationPermissions.precise) {
      throw Object.assign(new Error('Autorisation de position précise refusée'), { code: 'PERMISSION_DENIED' });
    }
    if (!this.position) throw this.unavailable('Position introuvable');
    return { ...this.position };
  }

  async getLocationPermissions(): Promise<LocationPermissions> {
    return { ...this.locationPermissions };
  }

  async requestLocationPermissions(): Promise<LocationPermissionResult> {
    this.locationRequests++;
    if (this.grantLocation) this.locationPermissions = { precise: true, background: true };
    return { ...this.locationPermissions, settingsOpened: false };
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

/** Genre de fond animé : une scène par genre dans le service Prisme. */
export type LiveMode = 'image' | 'video' | 'gif' | 'gradient' | 'particles' | 'relief';

/**
 * Liste d'images du fond animé (genre « photo ») : images (id + URI d'application), fréquence en
 * déverrouillages et, avec `unlock`, changement à chaque déverrouillage (sinon : double-tap seulement).
 */
export interface LivePlaylist {
  enabled: boolean;
  every: number;
  items: { id: string; uri: string }[];
  unlock?: boolean;
}

/** Dernier relevé de la météo animée (natif) : code WMO, lieu et heure du relevé (ms). */
export interface LiveWeatherStatus {
  code: number;
  isDay: boolean;
  /** Précipitations (mm) et vent (km/h). */
  precipitation: number;
  wind: number;
  latitude: number;
  longitude: number;
  updatedAt: number;
}

export interface LiveStatus {
  active: boolean;
  intensity: number;
  configured: boolean;
  mode: LiveMode;
  /** Pause en économie de batterie activée. */
  eco: boolean;
  doubleTap: boolean;
  /** Fond figé en ce moment : économie d'énergie ou batterie faible (seulement si `eco`). */
  paused: boolean;
  /** `count` : images prêtes (préparées sur l'appareil), `every` : déverrouillages entre deux changements. */
  playlist: { enabled: boolean; count: number; every: number; unlock?: boolean };
  /** Météo animée : dernier relevé, absent tant qu'aucun n'a été fait. */
  weather?: LiveWeatherStatus;
}

/** Genre, options communes et réglages propres au genre (objet libre, lu par la scène native). */
export interface LiveConfiguration {
  mode: LiveMode;
  eco: boolean;
  doubleTap: boolean;
  settings?: Record<string, unknown>;
}

export interface PrismeLivePlugin {
  setLiveWallpaper(options: { uri: string; intensity: number; crop?: NormalizedRect }): Promise<{ status: 'launched' | 'updated' }>;
  /**
   * Le natif enregistre la liste puis prépare les images en arrière-plan (téléchargement, recadrage) ;
   * `count` : images déjà prêtes. La suite se lit dans `getStatus().playlist`.
   */
  setPlaylist(options: LivePlaylist): Promise<{ enabled: boolean; count: number }>;
  /** Enregistre le genre et ses réglages ; le service suit aussitôt s'il est actif. */
  configure(options: LiveConfiguration): Promise<{ active: boolean }>;
  /** Ouvre l'écran d'Android qui active le fond animé Prisme (« active » : il l'est déjà). */
  activate(): Promise<{ status: 'active' | 'launched' }>;
  getStatus(): Promise<LiveStatus>;
}

export class PrismeLiveWeb extends WebPlugin implements PrismeLivePlugin {
  calls: { uri: string; intensity: number; crop?: NormalizedRect }[] = [];
  /** Tests : appels à `setPlaylist`, dans l'ordre. */
  playlistCalls: LivePlaylist[] = [];
  /** Tests : appels à `configure`, dans l'ordre. */
  configureCalls: LiveConfiguration[] = [];
  activated = false;
  /** Tests : fond figé (économie d'énergie). */
  paused = false;
  /** Tests : dernier relevé de la météo animée (fait par le natif quand le fond est visible). */
  weather: LiveWeatherStatus | undefined;

  constructor() {
    super();
    window.__prismeLiveWeb = this;
  }

  async setLiveWallpaper(options: { uri: string; intensity: number; crop?: NormalizedRect }) {
    this.calls.push(options);
    const status = this.activated ? ('updated' as const) : ('launched' as const);
    this.activated = true;
    return { status };
  }

  async setPlaylist(options: LivePlaylist) {
    this.playlistCalls.push(options);
    return { enabled: options.enabled, count: options.enabled ? options.items.length : 0 };
  }

  async configure(options: LiveConfiguration) {
    this.configureCalls.push(options);
    return { active: this.activated };
  }

  async activate() {
    const status = this.activated ? ('active' as const) : ('launched' as const);
    this.activated = true;
    return { status };
  }

  async getStatus(): Promise<LiveStatus> {
    const playlist = this.playlistCalls.at(-1);
    const config = this.configureCalls.at(-1);
    return {
      active: this.activated,
      intensity: this.calls.at(-1)?.intensity ?? 0.5,
      configured: this.calls.length > 0,
      mode: config?.mode ?? 'image',
      eco: config?.eco ?? true,
      doubleTap: config?.doubleTap ?? false,
      paused: (config?.eco ?? true) && this.paused,
      playlist: {
        enabled: playlist?.enabled ?? false,
        count: playlist?.enabled ? playlist.items.length : 0,
        every: playlist?.every ?? 1,
        unlock: playlist?.unlock ?? true,
      },
      ...(this.weather ? { weather: { ...this.weather } } : {}),
    };
  }
}

export const PrismeLive = registerPlugin<PrismeLivePlugin>('PrismeLive', {
  web: () => (liveWeb ??= new PrismeLiveWeb()),
});
