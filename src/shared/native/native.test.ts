// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  // jsdom n'implémente pas matchMedia.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }) as never;
});

describe('pont natif (implémentation web)', () => {
  it('convertit les chemins en URL affichables', async () => {
    const { toWebUrl } = await import('./index');
    expect(toWebUrl('https://images.unsplash.com/x.jpg')).toBe('https://images.unsplash.com/x.jpg');
    expect(toWebUrl('blob:abc')).toBe('blob:abc');
  });

  it('extrait le message des erreurs du plugin', async () => {
    const { nativeErrorMessage } = await import('./index');
    expect(nativeErrorMessage({ message: 'Image introuvable', code: 'NOT_FOUND' })).toBe('Image introuvable');
    expect(nativeErrorMessage(42)).toBe('Une erreur inattendue est survenue');
  });

  it('journalise les fonds appliqués et notifie la progression', async () => {
    const { PrismeWallpaperWeb } = await import('./web');
    const plugin = new PrismeWallpaperWeb();
    const progress = vi.fn();
    await plugin.addListener('applyProgress', progress);
    const result = await plugin.setWallpaper({ uri: 'https://x/1.jpg', target: 'lock', id: 'unsplash:1' });
    expect(result.target).toBe('lock');
    expect(plugin.applied).toEqual([{ uri: 'https://x/1.jpg', target: 'lock', id: 'unsplash:1' }]);
    expect(progress).toHaveBeenCalledWith({ id: 'unsplash:1', progress: 1 });
    expect(window.__prismeWeb).toBe(plugin);
  });

  it('renvoie un thème système et une taille d’écran en portrait', async () => {
    const { PrismeWallpaperWeb } = await import('./web');
    const plugin = new PrismeWallpaperWeb();
    expect(await plugin.getSystemTheme()).toEqual({ isDark: true, sdkInt: 0 });
    const screen = await plugin.getScreenInfo();
    expect(screen.height).toBeGreaterThanOrEqual(screen.width);
  });
});
