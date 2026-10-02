import { type PluginListenerHandle, WebPlugin, registerPlugin } from '@capacitor/core';

export interface AppInfo {
  packageName: string;
  versionName: string;
  /** Numéro de build CI : sert à comparer avec les releases GitHub. */
  versionCode: number;
  /** Android 8+ : autorisation « installer des applis inconnues » accordée à Prisme. */
  canInstallPackages: boolean;
}

export interface NetworkStatus {
  connected: boolean;
  /** Connexion facturée au volume (données mobiles, partage de connexion…). */
  metered: boolean;
}

export type HapticKind = 'confirm' | 'reject' | 'tick' | 'long';

/** Entrée du journal d'erreurs (natif ou interface). */
export interface ErrorEntry {
  at: number;
  source: 'native' | 'js';
  where: string;
  message: string;
  stack?: string;
}

export type ImportFileResult = { cancelled: true } | { cancelled: false; data: string };

/** Action qui ouvre l'app : raccourci de l'icône (« Rechercher ») ou notification « Fond du jour ». */
export type AppAction = 'SEARCH' | 'DAILY';

export type NotificationPermission = 'granted' | 'denied';

/** `requested` : la demande est partie (le lanceur affiche sa confirmation) ; `unsupported` : à faire depuis la liste des widgets. */
export type PinWidgetResult = 'requested' | 'unsupported';

export interface PrismeSystemPlugin {
  getAppInfo(): Promise<AppInfo>;
  getNetworkStatus(): Promise<NetworkStatus>;
  haptic(options: { kind: HapticKind }): Promise<void>;
  exportFile(options: { fileName: string; mimeType?: string; data: string }): Promise<{ saved: boolean }>;
  importFile(): Promise<ImportFileResult>;
  shareText(options: { text: string; title?: string }): Promise<void>;
  getErrorLog(): Promise<{ entries: ErrorEntry[] }>;
  clearErrorLog(): Promise<void>;
  /** Télécharge et vérifie l'APK (même appli, plus récent, même signature). */
  downloadUpdate(options: { url: string }): Promise<{ ready: boolean }>;
  /** Ouvre l'installateur du système ; rejette `INSTALL_PERMISSION` sans l'autorisation. */
  installUpdate(): Promise<void>;
  openInstallSettings(): Promise<void>;
  getPendingAction(): Promise<{ action: AppAction | null }>;
  /** Android 13+ : demande d'ajouter la tuile « Fond suivant » aux Réglages rapides. */
  requestAddTile(): Promise<{ result: 'added' | 'already' | 'declined' | 'unsupported' | 'error' }>;
  /** Android 8+ : demande au lanceur de poser le widget d'accueil (aperçu du fond actuel et bouton « Fond suivant »). */
  requestPinWidget(): Promise<{ result: PinWidgetResult }>;
  /**
   * Notification quotidienne « Fond du jour » à `hour` h. Avec `prompt`, demande l'autorisation
   * d'afficher des notifications (Android 13+) si elle manque.
   */
  setDailyNotification(options: { enabled: boolean; hour: number; prompt?: boolean }): Promise<{ enabled: boolean; permission: NotificationPermission }>;
  addListener(event: 'appAction', listener: (e: { action: AppAction }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'networkChanged', listener: (e: NetworkStatus) => void): Promise<PluginListenerHandle>;
  addListener(event: 'updateProgress', listener: (e: { progress: number }) => void): Promise<PluginListenerHandle>;
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
 * Navigateur (développement, tests e2e) : rien ne quitte la page, les appels sont journalisés
 * dans `window.__prismeSystemWeb` et les réponses se règlent depuis les tests.
 */
export class PrismeSystemWeb extends WebPlugin implements PrismeSystemPlugin {
  versionCode = Number.parseInt(__APP_VERSION__.split('.').at(-1) ?? '', 10) || 0;
  metered = false;
  canInstall = true;
  nativeErrors: ErrorEntry[] = [];
  nextImport: string | null = null;
  pendingAction: AppAction | null = null;
  readonly haptics: HapticKind[] = [];
  readonly exports: { fileName: string; mimeType?: string; data: string }[] = [];
  readonly sharedTexts: { text: string; title?: string }[] = [];
  readonly downloads: string[] = [];
  installs = 0;
  settingsOpened = 0;
  private downloaded = false;

  constructor() {
    super();
    window.__prismeSystemWeb = this;
  }

  async getAppInfo(): Promise<AppInfo> {
    return { packageName: 'io.karelisio.prisme', versionName: __APP_VERSION__, versionCode: this.versionCode, canInstallPackages: this.canInstall };
  }

  async getNetworkStatus(): Promise<NetworkStatus> {
    return { connected: navigator.onLine, metered: this.metered };
  }

  /** Tests : simule un passage en données mobiles ou en Wi-Fi. */
  setMetered(metered: boolean) {
    this.metered = metered;
    this.notifyListeners('networkChanged', { connected: navigator.onLine, metered });
  }

  async haptic(options: { kind: HapticKind }) {
    this.haptics.push(options.kind);
  }

  async exportFile(options: { fileName: string; mimeType?: string; data: string }) {
    this.exports.push(options);
    return { saved: true };
  }

  async importFile(): Promise<ImportFileResult> {
    if (this.nextImport !== null) {
      const data = this.nextImport;
      this.nextImport = null;
      return { cancelled: false, data };
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) resolve({ cancelled: true });
        else void file.text().then((data) => resolve({ cancelled: false, data }));
      });
      input.addEventListener('cancel', () => resolve({ cancelled: true }));
      input.click();
    });
  }

  async shareText(options: { text: string; title?: string }) {
    this.sharedTexts.push(options);
  }

  async getErrorLog() {
    return { entries: this.nativeErrors };
  }

  async clearErrorLog() {
    this.nativeErrors = [];
  }

  async downloadUpdate(options: { url: string }) {
    this.downloads.push(options.url);
    this.notifyListeners('updateProgress', { progress: 0.5 });
    this.notifyListeners('updateProgress', { progress: 1 });
    this.downloaded = true;
    return { ready: true };
  }

  async installUpdate() {
    if (!this.downloaded) throw new CodedError('NOT_FOUND', 'Aucune mise à jour téléchargée');
    if (!this.canInstall) throw new CodedError('INSTALL_PERMISSION', 'Autorise Prisme à installer des applications');
    this.installs++;
  }

  async openInstallSettings() {
    this.settingsOpened++;
  }

  tileRequests = 0;
  tileResult: 'added' | 'already' | 'declined' | 'unsupported' | 'error' = 'added';
  notificationPermission: NotificationPermission = 'granted';
  readonly dailyCalls: { enabled: boolean; hour: number; prompt?: boolean }[] = [];

  async setDailyNotification(options: { enabled: boolean; hour: number; prompt?: boolean }) {
    this.dailyCalls.push(options);
    return { enabled: options.enabled, permission: this.notificationPermission };
  }

  async requestAddTile() {
    this.tileRequests++;
    return { result: this.tileResult };
  }

  widgetRequests = 0;
  widgetResult: PinWidgetResult = 'requested';

  async requestPinWidget() {
    this.widgetRequests++;
    return { result: this.widgetResult };
  }

  async getPendingAction() {
    const action = this.pendingAction;
    this.pendingAction = null;
    return { action };
  }

  /** Tests : simule un raccourci de l'icône pendant que l'app est ouverte. */
  triggerAction(action: AppAction) {
    this.notifyListeners('appAction', { action });
  }
}

// Une seule instance : Capacitor peut appeler ce chargeur pour plusieurs appels simultanés.
let webInstance: PrismeSystemWeb | undefined;

export const PrismeSystem = registerPlugin<PrismeSystemPlugin>('PrismeSystem', {
  web: () => (webInstance ??= new PrismeSystemWeb()),
});

/** Code d'erreur stable renvoyé par un plugin natif (ou undefined). */
export function nativeErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return undefined;
}

declare global {
  interface Window {
    __prismeSystemWeb?: PrismeSystemWeb;
  }
}
