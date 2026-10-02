import { type PluginListenerHandle, WebPlugin, registerPlugin } from '@capacitor/core';

export type ScanResult = { cancelled: true } | { cancelled: false; value: string };

/** Partage de collections : lien « prisme://collection/… » reçu et scanner de QR code. */
export interface PrismeLibraryPlugin {
  /**
   * Scanner de QR code de Google Play services : s'ouvre en plein écran sans permission caméra.
   * Rejette `UNAVAILABLE` quand le téléphone n'a pas les services Google Play.
   */
  scanQr(): Promise<ScanResult>;
  /**
   * Lien « prisme://collection/… » ouvert depuis une messagerie ou le navigateur, que l'app soit
   * déjà ouverte ou lancée par ce lien (l'événement attend alors le premier écouteur).
   */
  addListener(event: 'collectionLink', listener: (e: { url: string }) => void): Promise<PluginListenerHandle>;
}

class CodedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Navigateur (développement, tests e2e) : pas de caméra, les appels sont journalisés dans
 * `window.__prismeLibraryWeb` et les réponses se règlent depuis les tests.
 */
export class PrismeLibraryWeb extends WebPlugin implements PrismeLibraryPlugin {
  /** Tests : false simule un téléphone sans services Google Play. */
  scannerAvailable = true;
  /** Tests : contenu que le prochain scan « lira » ; null simule un scanner refermé sans résultat. */
  nextScan: string | null = null;
  scans = 0;

  constructor() {
    super();
    window.__prismeLibraryWeb = this;
  }

  async scanQr(): Promise<ScanResult> {
    this.scans++;
    if (!this.scannerAvailable) {
      throw new CodedError('UNAVAILABLE', 'Le scanner de QR code demande les services Google Play, absents de ce téléphone');
    }
    const value = this.nextScan;
    this.nextScan = null;
    return value === null ? { cancelled: true } : { cancelled: false, value };
  }

  /** Tests : simule l'ouverture d'un lien de collection (comme Android, l'événement attend un écouteur). */
  triggerLink(url: string) {
    this.notifyListeners('collectionLink', { url }, true);
  }
}

// Une seule instance : Capacitor peut appeler ce chargeur pour plusieurs appels simultanés.
let webInstance: PrismeLibraryWeb | undefined;

export const PrismeLibrary = registerPlugin<PrismeLibraryPlugin>('PrismeLibrary', {
  web: () => (webInstance ??= new PrismeLibraryWeb()),
});

declare global {
  interface Window {
    __prismeLibraryWeb?: PrismeLibraryWeb;
  }
}
