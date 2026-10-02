// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PrismeSystemWeb } from './system';

describe('pont système (implémentation web)', () => {
  it('journalise les demandes de widget et renvoie le résultat réglé par les tests', async () => {
    const plugin = new PrismeSystemWeb();
    expect(window.__prismeSystemWeb).toBe(plugin);
    expect(plugin.widgetRequests).toBe(0);

    // Par défaut : le lanceur accepte de poser le widget.
    expect(await plugin.requestPinWidget()).toEqual({ result: 'requested' });
    plugin.widgetResult = 'unsupported';
    expect(await plugin.requestPinWidget()).toEqual({ result: 'unsupported' });
    expect(plugin.widgetRequests).toBe(2);

    // La tuile des Réglages rapides a son propre compteur.
    expect(plugin.tileRequests).toBe(0);
  });
});
