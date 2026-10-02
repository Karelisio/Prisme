import { WebPlugin, registerPlugin } from '@capacitor/core';
import type { WallpaperTarget } from './definitions';

/** Une phrase à poser : texte et auteur facultatif. */
export interface NativeQuote {
  text: string;
  author?: string;
}

/**
 * Réglages envoyés au natif, qui travaille app fermée : il choisit la phrase du jour dans `quotes` (même calcul
 * que l'app, `shift` compris) et la dessine sur les fonds posés par Prisme, chaque matin vers 6 h.
 */
export interface QuoteConfig {
  enabled: boolean;
  /** Écran(s) qui reçoivent la phrase. */
  target: WallpaperTarget;
  font: 'serif' | 'sans';
  position: 'top' | 'center' | 'bottom';
  size: 'small' | 'medium' | 'large';
  color: 'auto' | 'white' | 'black';
  /** Crans avancés par « Une autre » : passent à la phrase suivante, aujourd'hui comme les jours suivants. */
  shift: number;
  /** Liste active (proverbes, citations perso, ou les deux) : une seule source de vérité pour l'app et le natif. */
  quotes: NativeQuote[];
}

export interface QuoteStatus {
  /** Le fond d'accueil posé par Prisme est gardé en copie : la phrase peut s'y ajouter. */
  home: boolean;
  /** Idem pour l'écran de verrouillage. */
  lock: boolean;
  /** Un fond animé occupe l'accueil : la phrase n'y est pas ajoutée. */
  homeLive: boolean;
  /** Un fond animé occupe l'écran de verrouillage (ou il suit celui de l'accueil). */
  lockLive: boolean;
}

export interface PrismeQuotePlugin {
  /** Enregistre les réglages, programme le renouvellement du matin et réapplique tout de suite les fonds si besoin. */
  configure(options: QuoteConfig): Promise<void>;
  getStatus(): Promise<QuoteStatus>;
}

/**
 * Navigateur (développement, tests e2e) : rien ne quitte la page, les réglages envoyés sont journalisés dans
 * `window.__prismeQuoteWeb` et l'état des fonds se règle depuis les tests.
 */
export class PrismeQuoteWeb extends WebPlugin implements PrismeQuotePlugin {
  readonly configs: QuoteConfig[] = [];
  status: QuoteStatus = { home: false, lock: false, homeLive: false, lockLive: false };

  constructor() {
    super();
    window.__prismeQuoteWeb = this;
  }

  async configure(options: QuoteConfig) {
    this.configs.push(options);
  }

  async getStatus(): Promise<QuoteStatus> {
    return { ...this.status };
  }
}

// Une seule instance : Capacitor peut appeler ce chargeur pour plusieurs appels simultanés.
let webInstance: PrismeQuoteWeb | undefined;

export const PrismeQuote = registerPlugin<PrismeQuotePlugin>('PrismeQuote', {
  web: () => (webInstance ??= new PrismeQuoteWeb()),
});

declare global {
  interface Window {
    __prismeQuoteWeb?: PrismeQuoteWeb;
  }
}
