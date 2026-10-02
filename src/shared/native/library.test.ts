// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PrismeLibraryWeb } from './library';

describe('pont bibliothèque (implémentation web)', () => {
  it('simule le scanner de QR code : lecture, scanner refermé, services Google Play absents', async () => {
    const plugin = new PrismeLibraryWeb();
    expect(window.__prismeLibraryWeb).toBe(plugin);

    // Rien à lire : le scanner est refermé sans résultat.
    expect(await plugin.scanQr()).toEqual({ cancelled: true });
    plugin.nextScan = 'prisme://collection/abc';
    expect(await plugin.scanQr()).toEqual({ cancelled: false, value: 'prisme://collection/abc' });
    // Chaque lecture est consommée.
    expect(await plugin.scanQr()).toEqual({ cancelled: true });

    plugin.scannerAvailable = false;
    await expect(plugin.scanQr()).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.stringContaining('services Google Play') });
    expect(plugin.scans).toBe(4);
  });

  it('garde un lien reçu jusqu’au premier écouteur, comme Android', async () => {
    const plugin = new PrismeLibraryWeb();
    plugin.triggerLink('prisme://collection/avant');
    const listener = vi.fn();
    await plugin.addListener('collectionLink', listener);
    expect(listener).toHaveBeenCalledWith({ url: 'prisme://collection/avant' });
    plugin.triggerLink('prisme://collection/apres');
    expect(listener).toHaveBeenLastCalledWith({ url: 'prisme://collection/apres' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
