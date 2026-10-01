import { WebPlugin } from '@capacitor/core';
import type {
  Capabilities,
  LocalImage,
  PickImageResult,
  PrismeWallpaperPlugin,
  ScreenInfo,
  SetWallpaperOptions,
  SetWallpaperResult,
  SystemTheme,
} from './definitions';

/**
 * Implémentation navigateur (développement et tests e2e) : rien n'est réellement appliqué,
 * les appels sont journalisés dans `window.__prismeWeb` pour pouvoir être vérifiés.
 */
export class PrismeWallpaperWeb extends WebPlugin implements PrismeWallpaperPlugin {
  readonly applied: SetWallpaperOptions[] = [];
  private readonly darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    super();
    window.__prismeWeb = this;
    this.darkQuery.addEventListener('change', () => {
      void this.getSystemTheme().then((theme) => this.notifyListeners('systemThemeChanged', theme));
    });
  }

  async getCapabilities(): Promise<Capabilities> {
    return {
      supported: true,
      settable: true,
      lockScreen: true,
      // Simulé : permet de tester l'option fond animé dans le navigateur.
      liveWallpaper: true,
      dynamicColor: false,
      sdkInt: 0,
      manufacturer: 'web',
      model: navigator.userAgent,
    };
  }

  async getScreenInfo(): Promise<ScreenInfo> {
    const density = window.devicePixelRatio || 1;
    const w = Math.round(window.screen.width * density);
    const h = Math.round(window.screen.height * density);
    return { width: Math.min(w, h), height: Math.max(w, h), density };
  }

  async getSystemTheme(): Promise<SystemTheme> {
    return { isDark: this.darkQuery.matches, sdkInt: 0 };
  }

  async setWallpaper(options: SetWallpaperOptions): Promise<SetWallpaperResult> {
    if (!options.uri) throw this.unavailable('uri manquant');
    this.applied.push(options);
    this.notifyListeners('applyProgress', { id: options.id ?? options.uri, progress: 1 });
    const screen = await this.getScreenInfo();
    return { target: options.target, width: screen.width, height: screen.height };
  }

  async cacheImage(options: { url: string }): Promise<{ path: string }> {
    return { path: options.url };
  }

  async removeOfflineImage(): Promise<{ removed: boolean }> {
    return { removed: true };
  }

  async saveImage(options: { data: string }): Promise<LocalImage> {
    const blob = await (await fetch(options.data)).blob();
    const path = URL.createObjectURL(blob);
    return { path, thumbPath: path, ...(await measure(path)) };
  }

  async deleteLocalImage(options: { path: string }): Promise<{ deleted: boolean }> {
    if (options.path.startsWith('blob:')) URL.revokeObjectURL(options.path);
    return { deleted: true };
  }

  pickImage(): Promise<PickImageResult> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ cancelled: true });
          return;
        }
        const path = URL.createObjectURL(file);
        measure(path).then((size) => resolve({ cancelled: false, path, thumbPath: path, ...size }), reject);
      });
      input.addEventListener('cancel', () => resolve({ cancelled: true }));
      input.click();
    });
  }

  async getCacheInfo(): Promise<{ cacheBytes: number; offlineBytes: number }> {
    return { cacheBytes: 0, offlineBytes: 0 };
  }

  async clearCache(): Promise<void> {}
}

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

declare global {
  interface Window {
    __prismeWeb?: PrismeWallpaperWeb;
  }
}
