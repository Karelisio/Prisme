import { afterEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_VERSION, migrateSettings } from './store';

describe('migration des réglages', () => {
  it('reprend l’ancien nombre de colonnes comme disposition de la grille', () => {
    expect(migrateSettings({ gridColumns: 3, themeMode: 'dark', haptics: false }, 1)).toEqual({
      gridLayout: '3',
      themeMode: 'dark',
      haptics: false,
    });
    expect(migrateSettings({ gridColumns: 2 }, 1)).toEqual({ gridLayout: '2' });
  });

  it('ne touche pas à une disposition du nouveau format', () => {
    expect(migrateSettings({ gridLayout: '4' }, SETTINGS_VERSION)).toEqual({ gridLayout: '4' });
    expect(migrateSettings({ gridLayout: 'mosaic' }, SETTINGS_VERSION)).toEqual({ gridLayout: 'mosaic' });
    // Le nouveau format ne porte plus `gridColumns` : il est ignoré.
    expect(migrateSettings({ gridColumns: 3, gridLayout: 'mosaic' }, SETTINGS_VERSION)).toEqual({ gridLayout: 'mosaic' });
  });

  it('écarte les valeurs inconnues pour que le défaut s’applique', () => {
    expect(migrateSettings({ gridColumns: 'trois' }, 1)).toEqual({});
    expect(migrateSettings({ gridColumns: 7 }, 1)).toEqual({});
    expect(migrateSettings({ gridLayout: 'carrée', themeMode: 'violet', dailyHour: 8 }, SETTINGS_VERSION)).toEqual({ dailyHour: 8 });
    expect(migrateSettings(null, 1)).toEqual({});
    expect(migrateSettings('abîmé', SETTINGS_VERSION)).toEqual({});
  });

  it('accepte le thème noir', () => {
    expect(migrateSettings({ themeMode: 'black' }, SETTINGS_VERSION)).toEqual({ themeMode: 'black' });
  });
});

describe('réglages enregistrés par la version précédente', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function stubStorage(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    return data;
  }

  it('sont relus, migrés puis réenregistrés dans le nouveau format', async () => {
    const data = stubStorage({
      'prisme-settings': JSON.stringify({ state: { gridColumns: 3, themeMode: 'dark', sources: { pexels: false } }, version: 1 }),
    });
    vi.resetModules();
    const { useSettings, DEFAULT_SETTINGS } = await import('./store');
    const state = useSettings.getState();
    expect(state.gridLayout).toBe('3');
    expect(state.themeMode).toBe('dark');
    // Les options absentes de l'ancien format prennent leur valeur par défaut.
    expect(state.sources).toEqual({ ...DEFAULT_SETTINGS.sources, pexels: false });
    expect(state.haptics).toBe(DEFAULT_SETTINGS.haptics);
    const stored = JSON.parse(data.get('prisme-settings') ?? '{}');
    expect(stored.version).toBe(SETTINGS_VERSION);
    expect(stored.state.gridLayout).toBe('3');
    expect(stored.state).not.toHaveProperty('gridColumns');
  });

  it('retombent sur les valeurs par défaut quand le stockage est vide ou abîmé', async () => {
    stubStorage({ 'prisme-settings': JSON.stringify({ state: { gridLayout: 'carrée', themeMode: 12 }, version: SETTINGS_VERSION }) });
    vi.resetModules();
    const { useSettings, DEFAULT_SETTINGS } = await import('./store');
    expect(useSettings.getState().gridLayout).toBe(DEFAULT_SETTINGS.gridLayout);
    expect(useSettings.getState().themeMode).toBe(DEFAULT_SETTINGS.themeMode);
  });
});
