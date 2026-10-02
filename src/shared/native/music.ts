import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { WallpaperTarget } from './definitions';

/** Réglages envoyés au natif : le service d'écoute les lit même app fermée. */
export interface MusicConfig {
  enabled: boolean;
  /** Écran qui reçoit la pochette. */
  target: WallpaperTarget;
  /** Remet le fond précédent quand la musique s'arrête. */
  restore: boolean;
}

export interface MusicStatus {
  /** Accès aux notifications accordé à Prisme : sans lui, Android ne montre pas la musique en cours. */
  accessGranted: boolean;
  enabled: boolean;
  /** Une pochette est actuellement posée en fond d'écran. */
  showing: boolean;
}

export interface PrismeMusicPlugin {
  getStatus(): Promise<MusicStatus>;
  /** Ouvre la liste Android des applis autorisées à lire les notifications. */
  openAccessSettings(): Promise<void>;
  /** Couper l'option pendant qu'une pochette est affichée remet le fond précédent. */
  configure(options: MusicConfig): Promise<void>;
}

/**
 * Navigateur (développement, tests e2e) : rien ne quitte la page, les appels sont journalisés
 * dans `window.__prismeMusicWeb` et l'accès aux notifications se règle depuis les tests.
 */
export class PrismeMusicWeb extends WebPlugin implements PrismeMusicPlugin {
  accessGranted = false;
  showing = false;
  settingsOpened = 0;
  readonly configs: MusicConfig[] = [];

  constructor() {
    super();
    window.__prismeMusicWeb = this;
  }

  async getStatus(): Promise<MusicStatus> {
    return { accessGranted: this.accessGranted, enabled: this.configs.at(-1)?.enabled ?? false, showing: this.showing };
  }

  async openAccessSettings() {
    this.settingsOpened++;
  }

  async configure(options: MusicConfig) {
    this.configs.push(options);
  }
}

// Une seule instance : Capacitor peut appeler ce chargeur pour plusieurs appels simultanés.
let webInstance: PrismeMusicWeb | undefined;

export const PrismeMusic = registerPlugin<PrismeMusicPlugin>('PrismeMusic', {
  web: () => (webInstance ??= new PrismeMusicWeb()),
});

declare global {
  interface Window {
    __prismeMusicWeb?: PrismeMusicWeb;
  }
}
