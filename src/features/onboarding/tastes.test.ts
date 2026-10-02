import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATEGORIES } from '@/features/browse/categories';
import { EMPTY_TASTES, MAX_TASTE_CATEGORIES, MAX_TASTE_COLORS, ONBOARDING_STORAGE_KEY, type Tastes } from './store';
import { TASTE_CATEGORIES, TASTE_COLORS, hasTastes, tasteLabels, tasteSpec, toggleCategory, toggleChoice, toggleColor } from './tastes';

describe('goûts de l’introduction', () => {
  it('propose les thèmes d’Explorer, sans les sélections générales', () => {
    const keys = TASTE_CATEGORIES.map((c) => c.key);
    expect(keys).toContain('nature');
    expect(keys).toContain('space');
    for (const general of ['featured', 'trending', 'latest']) expect(keys).not.toContain(general);
    expect(TASTE_CATEGORIES.every((c) => c.queries.length > 0)).toBe(true);
    expect(TASTE_COLORS.some((c) => c.value === 'black_and_white')).toBe(false);
  });

  it('ajoute, retire, et oublie le plus ancien au-delà du maximum', () => {
    expect(toggleChoice(['a'], 'b', 3)).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a', 3)).toEqual(['b']);
    expect(toggleChoice(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
    let tastes = EMPTY_TASTES;
    for (const key of ['nature', 'minimal', 'abstract', 'dark', 'space']) tastes = toggleCategory(tastes, key);
    expect(tastes.categories).toEqual(['minimal', 'abstract', 'dark', 'space']);
    expect(tastes.categories).toHaveLength(MAX_TASTE_CATEGORIES);
    for (const color of ['blue', 'red', 'green', 'teal'] as const) tastes = toggleColor(tastes, color);
    expect(tastes.colors).toEqual(['red', 'green', 'teal']);
    expect(tastes.colors).toHaveLength(MAX_TASTE_COLORS);
  });

  it('ne produit pas de flux sans goût, et ignore les goûts inconnus', () => {
    expect(hasTastes(EMPTY_TASTES)).toBe(false);
    expect(tasteSpec(EMPTY_TASTES)).toBeNull();
    expect(tasteSpec({ categories: ['inconnue'], colors: [] })).toBeNull();
    const unknown = { categories: ['inconnue'], colors: ['chartreuse'] } as unknown as Tastes;
    expect(hasTastes(unknown)).toBe(false);
    expect(tasteSpec(unknown)).toBeNull();
    expect(tasteLabels({ categories: ['nature', 'inconnue'], colors: ['chartreuse'] } as unknown as Tastes)).toEqual(['Nature']);
  });

  it('interroge les sources de chaque thème et de chaque couleur', () => {
    const spec = tasteSpec({ categories: ['nature', 'anime'], colors: ['blue'] });
    expect(spec).not.toBeNull();
    const nature = CATEGORIES.find((c) => c.key === 'nature')!;
    const anime = CATEGORIES.find((c) => c.key === 'anime')!;
    // Au plus deux requêtes par thème : « Pour toi » ne doit pas multiplier les appels à chaque page.
    expect(spec!.queries.slice(0, 2)).toEqual(nature.queries.slice(0, 2));
    expect(spec!.queries.slice(2, 3)).toEqual(anime.queries.slice(0, 1));
    expect(spec!.queries).toContainEqual({ kind: 'unsplash-search', query: 'wallpaper', color: 'blue' });
    expect(spec!.queries).toContainEqual({ kind: 'wallhaven', sorting: 'toplist', color: 'blue' });
    expect(spec!.queries).toHaveLength(2 + 1 + 2);
  });

  it('donne une clé de flux propre à chaque combinaison de goûts', () => {
    const a = tasteSpec({ categories: ['nature'], colors: [] })!;
    const b = tasteSpec({ categories: ['nature'], colors: ['blue'] })!;
    const c = tasteSpec({ categories: ['space'], colors: [] })!;
    expect(new Set([a.key, b.key, c.key]).size).toBe(3);
    expect(tasteSpec({ categories: ['nature'], colors: [] })!.key).toBe(a.key);
  });

  it('nomme les goûts choisis', () => {
    expect(tasteLabels({ categories: ['nature', 'minimal'], colors: ['blue'] })).toEqual(['Nature', 'Minimal', 'Bleu']);
    expect(tasteLabels({ categories: ['inconnue'], colors: [] })).toEqual([]);
  });
});

describe('introduction : premier lancement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function boot(initial: Record<string, string>) {
    const data = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    vi.resetModules();
    const { useOnboarding } = await import('./store');
    return { store: useOnboarding, data };
  }

  it('s’affiche au tout premier lancement, et la décision est enregistrée aussitôt', async () => {
    const { store, data } = await boot({});
    expect(store.getState().seen).toBe(false);
    expect(JSON.parse(data.get(ONBOARDING_STORAGE_KEY) ?? 'null').state.seen).toBe(false);
  });

  it('ne revient plus une fois terminée ou passée', async () => {
    const first = await boot({});
    first.store.getState().finish({ categories: ['nature'], colors: ['blue'] });
    const stored = first.data.get(ONBOARDING_STORAGE_KEY) ?? '';
    // Lancement suivant : même stockage.
    const second = await boot({ [ONBOARDING_STORAGE_KEY]: stored });
    expect(second.store.getState().seen).toBe(true);
    expect(second.store.getState().tastes).toEqual({ categories: ['nature'], colors: ['blue'] });
  });

  it('se rouvre à la demande, sans perdre les goûts', async () => {
    const { store } = await boot({});
    store.getState().finish({ categories: ['space'], colors: [] });
    store.getState().reopen();
    expect(store.getState().seen).toBe(false);
    expect(store.getState().tastes.categories).toEqual(['space']);
    // Fermée sans argument (« Passer ») : les goûts d'avant restent.
    store.getState().finish();
    expect(store.getState().seen).toBe(true);
    expect(store.getState().tastes.categories).toEqual(['space']);
  });

  it('ne s’impose pas à une installation qui existait avant l’introduction', async () => {
    const { store } = await boot({ 'prisme-settings': JSON.stringify({ state: { haptics: false }, version: 1 }) });
    expect(store.getState().seen).toBe(true);
  });

  it('revient si l’app est fermée avant la fin, même après un premier réglage', async () => {
    // Premier lancement, source désactivée pendant l'introduction, application fermée.
    const first = await boot({});
    const second = await boot({
      [ONBOARDING_STORAGE_KEY]: first.data.get(ONBOARDING_STORAGE_KEY) ?? '',
      'prisme-settings': JSON.stringify({ state: { sources: { pexels: false } }, version: 2 }),
    });
    expect(second.store.getState().seen).toBe(false);
  });

  it('écarte un stockage abîmé', async () => {
    const { store } = await boot({
      [ONBOARDING_STORAGE_KEY]: JSON.stringify({ state: { seen: 'oui', tastes: { categories: [3, 'nature'], colors: 'bleu' } }, version: 1 }),
    });
    expect(store.getState().seen).toBe(false);
    expect(store.getState().tastes).toEqual({ categories: ['nature'], colors: [] });
  });
});
