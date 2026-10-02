// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PrismeMusicWeb } from './music';

describe('pont de la pochette (implémentation web)', () => {
  it("journalise les réglages, compte les ouvertures des réglages Android et suit l'accès", async () => {
    const plugin = new PrismeMusicWeb();
    expect(window.__prismeMusicWeb).toBe(plugin);

    // Accès refusé tant que le test ne l'accorde pas.
    expect(await plugin.getStatus()).toEqual({ accessGranted: false, enabled: false, showing: false });

    await plugin.configure({ enabled: true, target: 'lock', restore: false });
    plugin.accessGranted = true;
    plugin.showing = true;
    expect(await plugin.getStatus()).toEqual({ accessGranted: true, enabled: true, showing: true });

    await plugin.openAccessSettings();
    await plugin.openAccessSettings();
    expect(plugin.settingsOpened).toBe(2);
    expect(plugin.configs).toEqual([{ enabled: true, target: 'lock', restore: false }]);
  });
});
