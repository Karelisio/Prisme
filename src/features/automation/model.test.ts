import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { DEFAULT_AUTOMATION, FAVORITES_SOURCE, QUICK_POOL_LIMIT, buildConfig, buildQuickPool, rotationItems } from './model';
import { DEFAULT_ONLINE, ONLINE_THEMES, type OnlineContext, onlineQueries, onlineSpec, onlineThemeLabel } from './online';

const wp = (id: string, local = false): Wallpaper => ({
  id,
  source: local ? 'creation' : 'unsplash',
  width: 1080,
  height: 2400,
  color: '#000',
  alt: id,
  thumb: `t/${id}`,
  preview: `p/${id}`,
  full: local ? `/data/creations/${id}.jpg` : `https://images.unsplash.com/${id}?fm=jpg`,
});

const library = {
  items: { a: wp('a'), b: wp('b'), c: wp('c', true) },
  favorites: { a: 1, b: 2 },
  collections: [{ id: 'col', name: 'Nuit', createdAt: 0, itemIds: ['c', 'a', 'disparu'] }],
};

const off = { rotation: false, dynamic: false, focus: false };

describe('configuration des automatismes', () => {
  it('tout est coupé tant que les options sont désactivées', () => {
    const config = buildConfig(DEFAULT_AUTOMATION, off, library);
    expect(config.rotation.enabled).toBe(false);
    expect(config.dynamic.enabled).toBe(false);
    expect(config.focus.enabled).toBe(false);
  });

  it('rotation depuis les favoris (récents d’abord) ou une collection', () => {
    expect(rotationItems(FAVORITES_SOURCE, library).map((w) => w.id)).toEqual(['b', 'a']);
    expect(rotationItems('col', library).map((w) => w.id)).toEqual(['c', 'a']);
    const config = buildConfig({ ...DEFAULT_AUTOMATION, rotation: { ...DEFAULT_AUTOMATION.rotation, source: 'col' } }, { ...off, rotation: true }, library);
    expect(config.rotation.items).toEqual([
      { id: 'c', uri: '/data/creations/c.jpg' },
      { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' },
    ]);
  });

  it('créneaux horaires : seuls ceux qui ont un fond sont envoyés', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, slots: { morning: 'a', night: 'c', day: 'inconnu' } } };
    const config = buildConfig(prefs, { ...off, dynamic: true }, library);
    expect(config.dynamic.time?.slots).toEqual([
      { start: '06:00', item: { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' } },
      { start: '22:00', item: { id: 'c', uri: '/data/creations/c.jpg' } },
    ]);
  });

  it('météo sans lieu : pas de configuration météo', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, mode: 'weather' as const, weather: { rain: 'a' } } };
    expect(buildConfig(prefs, { ...off, dynamic: true }, library).dynamic.weather).toBeUndefined();
    const withPlace = { ...prefs, dynamic: { ...prefs.dynamic, place: { name: 'Lyon', latitude: 45.76, longitude: 4.84 } } };
    expect(buildConfig(withPlace, { ...off, dynamic: true }, library).dynamic.weather).toEqual({
      latitude: 45.76,
      longitude: 4.84,
      items: { rain: { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' } },
    });
  });

  it('batterie : niveaux et recharge', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, mode: 'battery' as const, battery: { low: 'b', charging: 'c' } } };
    const config = buildConfig(prefs, { ...off, dynamic: true }, library);
    expect(config.dynamic.battery?.levels).toEqual([{ min: 0, max: 20, item: { id: 'b', uri: 'https://images.unsplash.com/b?fm=jpg' } }]);
    expect(config.dynamic.battery?.charging?.id).toBe('c');
  });

  it('mode focus : plages valides uniquement, jours triés', () => {
    const prefs = {
      ...DEFAULT_AUTOMATION,
      focus: {
        target: 'lock' as const,
        wallpaperId: 'c',
        schedules: [
          { id: '1', days: [5, 1], start: '09:00', end: '12:00' },
          { id: '2', days: [], start: '13:00', end: '14:00' },
          { id: '3', days: [6], start: '10:00', end: '10:00' },
        ],
      },
    };
    const config = buildConfig(prefs, { ...off, focus: true }, library);
    expect(config.focus).toEqual({
      enabled: true,
      target: 'lock',
      item: { id: 'c', uri: '/data/creations/c.jpg' },
      schedules: [{ days: [1, 5], start: '09:00', end: '12:00' }],
    });
  });

  it('réserve de la tuile : favoris récents d’abord, copie hors ligne si possible', () => {
    const library = {
      items: { a: wp('a'), b: wp('b'), c: wp('c') },
      favorites: { a: 1, b: 3, c: 2, fantome: 9 },
      offline: { c: { fullPath: '/data/offline/c' } },
      history: [],
    };
    expect(buildQuickPool(library, 'ask')).toEqual({
      target: 'both',
      items: [
        { id: 'b', uri: wp('b').full },
        { id: 'c', uri: '/data/offline/c' },
        { id: 'a', uri: wp('a').full },
      ],
    });
    expect(buildQuickPool(library, 'lock').target).toBe('lock');
    const many = Object.fromEntries(Array.from({ length: QUICK_POOL_LIMIT + 5 }, (_, i) => [`w${i}`, i]));
    const items = Object.fromEntries(Object.keys(many).map((id) => [id, wp(id)]));
    expect(buildQuickPool({ items, favorites: many, offline: {}, history: [] }, 'home').items).toHaveLength(QUICK_POOL_LIMIT);
  });

  it('réserve de la tuile sans favori : fonds déjà appliqués, sans doublon', () => {
    const history = [
      { id: 'h3', wallpaperId: 'b', target: 'home' as const, at: 3 },
      { id: 'h2', wallpaperId: 'a', target: 'both' as const, at: 2 },
      { id: 'h1', wallpaperId: 'b', target: 'lock' as const, at: 1 },
    ];
    const pool = buildQuickPool({ items: { a: wp('a'), b: wp('b') }, favorites: {}, offline: {}, history }, 'ask');
    expect(pool.items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('rotation en ligne', () => {
  const sources = { unsplash: true, pexels: true, wallhaven: true, pixabay: true, art: true, nasa: true };
  const ctx: OnlineContext = {
    sources,
    keys: { unsplash: 'cle-u', pexels: 'cle-p' },
    hidden: {
      hiddenIds: { 'unsplash:x': { id: 'unsplash:x', thumb: '', alt: '', at: 0 } },
      hiddenAuthors: { 'pexels:bob': { key: 'pexels:bob', name: 'Bob', source: 'pexels', at: 0 } },
      hiddenWords: ['voiture'],
    },
    favorites: [],
  };
  const online = (patch: Partial<typeof DEFAULT_AUTOMATION.rotation>) => ({ ...DEFAULT_AUTOMATION, rotation: { ...DEFAULT_AUTOMATION.rotation, ...patch } });

  it('par défaut : fonds d’écran au hasard sur toutes les sources (sauf Pixabay)', () => {
    const config = buildConfig(DEFAULT_AUTOMATION, { ...off, rotation: true }, library, ctx);
    expect(config.rotation.items).toEqual([]);
    expect(config.rotation.online?.key).toBe('featured:');
    expect(config.rotation.online?.queries).toEqual([
      { provider: 'unsplash', query: 'wallpaper', auth: 'Client-ID cle-u' },
      { provider: 'pexels', auth: 'cle-p' },
      { provider: 'wallhaven', query: '', categories: '100' },
    ]);
    expect(config.rotation.online?.exclude).toEqual({ ids: ['unsplash:x'], authors: ['pexels:bob'], words: ['voiture'] });
  });

  it('thème, mot-clé et sources désactivées', () => {
    const space = buildConfig(online({ online: { ...DEFAULT_ONLINE, theme: 'space' } }), { ...off, rotation: true }, library, {
      ...ctx,
      sources: { ...sources, pexels: false },
    });
    expect(space.rotation.online?.queries.map((q) => q.provider)).toEqual(['nasa', 'unsplash', 'wallhaven', 'nasa', 'nasa']);
    expect(space.rotation.online?.queries).toContainEqual({ provider: 'nasa', query: 'earth from space' });

    const keyword = buildConfig(online({ online: { theme: 'custom', keyword: ' Aurore ', wifiOnly: true } }), { ...off, rotation: true }, library, ctx);
    expect(keyword.rotation.online).toMatchObject({ key: 'custom:aurore', wifiOnly: true });
    expect(keyword.rotation.online?.queries[0]).toEqual({ provider: 'unsplash', query: 'Aurore', auth: 'Client-ID cle-u' });
    expect(onlineThemeLabel({ theme: 'custom', keyword: 'Aurore', wifiOnly: false })).toBe('« Aurore »');

    // Aucune source utilisable : pas de rotation en ligne.
    const none = Object.fromEntries(Object.keys(sources).map((k) => [k, false])) as typeof sources;
    expect(buildConfig(DEFAULT_AUTOMATION, { ...off, rotation: true }, library, { ...ctx, sources: none }).rotation.online).toBeUndefined();
  });

  it('« Pour toi » suit les favoris, sinon fonds d’écran', () => {
    const fav = (id: string, alt: string): Wallpaper => ({ ...wp(id), alt, author: { name: 'Ada', url: 'u', username: 'ada' } });
    const spec = onlineSpec({ ...DEFAULT_ONLINE, theme: 'foryou' }, [fav('1', 'mountain lake'), fav('2', 'mountain sky'), fav('3', 'mountain')]);
    const queries = onlineQueries(spec, ctx);
    expect(queries).toContainEqual({ provider: 'unsplash', query: 'mountain', auth: 'Client-ID cle-u' });
    expect(queries).toContainEqual({ provider: 'unsplash', username: 'ada', auth: 'Client-ID cle-u' });
    expect(queries.some((q) => (q as { provider: string }).provider === 'pixabay')).toBe(false);
    expect(onlineSpec({ ...DEFAULT_ONLINE, theme: 'foryou' }, []).key).toBe('featured');
    expect(ONLINE_THEMES.map((t) => t.key)).not.toContain('trending');
  });
});
