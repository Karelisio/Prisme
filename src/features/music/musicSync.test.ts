// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configure = vi.fn();
const sent = () => configure.mock.calls.map(([config]) => config);

beforeEach(() => {
  // Le dernier réglage envoyé est un état de module : chaque test repart de modules neufs.
  vi.resetModules();
  localStorage.clear();
  configure.mockReset();
  vi.doMock('@/shared/native/music', () => ({ PrismeMusic: { configure } }));
});

async function start() {
  const { useSettings } = await import('@/features/settings/store');
  const { useMusicPrefs } = await import('./store');
  const { startMusicSync } = await import('./musicSync');
  return { useSettings, useMusicPrefs, stop: startMusicSync() };
}

describe('synchronisation avec le natif', () => {
  it('envoie les réglages au lancement, puis à chaque changement utile, sans doublon', async () => {
    const { useSettings, useMusicPrefs, stop } = await start();
    expect(sent()).toEqual([{ enabled: false, target: 'both', restore: true }]);

    useSettings.getState().setFeature('music', true);
    expect(sent().at(-1)).toEqual({ enabled: true, target: 'both', restore: true });
    expect(sent()).toHaveLength(2);

    // Un réglage sans rapport, ou une valeur inchangée, n'envoie rien.
    useSettings.getState().update({ dailyHour: 7 });
    useSettings.getState().setFeature('live', true);
    useMusicPrefs.getState().update({ restore: true });
    expect(sent()).toHaveLength(2);

    useMusicPrefs.getState().update({ target: 'lock' });
    useMusicPrefs.getState().update({ restore: false });
    expect(sent().at(-1)).toEqual({ enabled: true, target: 'lock', restore: false });
    expect(sent()).toHaveLength(4);

    useSettings.getState().setFeature('music', false);
    expect(sent().at(-1)).toEqual({ enabled: false, target: 'lock', restore: false });
    stop();
  });

  it('réessaie au changement suivant quand le natif a refusé le réglage', async () => {
    configure.mockRejectedValueOnce(new Error('plugin absent'));
    const { useMusicPrefs, stop } = await start();
    // Laisse le refus remonter avant le changement suivant.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Le même réglage repart : l'échec n'a pas été retenu comme envoyé.
    useMusicPrefs.getState().update({ target: 'both' });
    expect(sent()).toEqual([
      { enabled: false, target: 'both', restore: true },
      { enabled: false, target: 'both', restore: true },
    ]);
    stop();
  });

  it('une fois arrêtée, la synchronisation ne suit plus les réglages', async () => {
    const { useSettings, stop } = await start();
    stop();
    useSettings.getState().setFeature('music', true);
    expect(sent()).toHaveLength(1);
  });

  it("reprend les préférences gardées d'une session précédente", async () => {
    localStorage.setItem('prisme-music', JSON.stringify({ state: { target: 'home', restore: false }, version: 1 }));
    localStorage.setItem('prisme-settings', JSON.stringify({ state: { features: { music: true } }, version: 1 }));
    const { stop } = await start();
    expect(sent()).toEqual([{ enabled: true, target: 'home', restore: false }]);
    stop();
  });
});
