import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pexelsPhoto, unsplashPhoto } from './__fixtures__/photos';
import { mapArtwork } from './art';
import { type FeedContext, type SourceQuery, dedupe, fetchFeedPage, interleave, resolveQueries, serverColor } from './feed';
import { mapNasa } from './nasa';
import { mapPexels } from './pexels';
import { mapPixabay } from './pixabay';
import { DEFAULT_SOURCES, type SourceToggles } from './registry';
import { ApiError, DEFAULT_FILTERS } from './types';
import { mapUnsplash } from './unsplash';

vi.mock('./unsplash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./unsplash')>();
  return { ...actual, unsplashTopic: vi.fn(), unsplashSearch: vi.fn(), unsplashCollection: vi.fn() };
});
vi.mock('./pexels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pexels')>();
  return { ...actual, pexelsCurated: vi.fn(), pexelsSearch: vi.fn(), pexelsCollection: vi.fn() };
});
vi.mock('./pixabay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pixabay')>();
  return { ...actual, pixabaySearch: vi.fn() };
});
vi.mock('./art', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./art')>();
  return { ...actual, artSearch: vi.fn() };
});
vi.mock('./nasa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nasa')>();
  return { ...actual, nasaSearch: vi.fn() };
});

const unsplash = await import('./unsplash');
const pexels = await import('./pexels');
const pixabay = await import('./pixabay');
const art = await import('./art');
const nasa = await import('./nasa');

const allSources: SourceToggles = { ...DEFAULT_SOURCES, pixabay: true };

const ctx: FeedContext = {
  filters: DEFAULT_FILTERS,
  screenRatio: 2.22,
  thumbWidth: 360,
  sources: allSources,
};

const queries: SourceQuery[] = [{ kind: 'unsplash-topic', slug: 'wallpapers' }, { kind: 'pexels-curated' }];

describe('flux', () => {
  beforeEach(() => vi.resetAllMocks());

  it('alterne et dédoublonne', () => {
    expect(interleave<number | string>([[1, 2, 3], ['a']])).toEqual([1, 'a', 2, 3]);
    const w = mapUnsplash(unsplashPhoto('x'), 360);
    expect(dedupe([w, w])).toHaveLength(1);
  });

  it('passe par la recherche quand une couleur est filtrée', () => {
    const resolved = resolveQueries(
      { key: 'nature', queries, searchQuery: 'nature' },
      { filters: { ...DEFAULT_FILTERS, color: 'green' }, sources: ctx.sources },
    );
    expect(resolved).toEqual([
      { kind: 'unsplash-search', query: 'nature' },
      { kind: 'pexels-search', query: 'nature' },
    ]);
  });

  it('ignore les sources désactivées', () => {
    expect(resolveQueries({ key: 'k', queries }, { filters: ctx.filters, sources: { ...allSources, unsplash: false } })).toEqual([
      { kind: 'pexels-curated' },
    ]);
    const wallhaven: SourceQuery = { kind: 'wallhaven', sorting: 'toplist' };
    expect(resolveQueries({ key: 'k', queries: [wallhaven, { kind: 'art' }] }, { filters: ctx.filters, sources: { ...allSources, art: false } })).toEqual([
      wallhaven,
    ]);
  });

  it('fusionne les sources et filtre les images non conformes', async () => {
    vi.mocked(unsplash.unsplashTopic).mockResolvedValue({
      items: [mapUnsplash(unsplashPhoto('a'), 360), mapUnsplash(unsplashPhoto('paysage', { width: 6000, height: 4000 }), 360)],
      next: 2,
    });
    vi.mocked(pexels.pexelsCurated).mockResolvedValue({ items: [mapPexels(pexelsPhoto(1), 360)], next: null });

    const page = await fetchFeedPage(queries, [1, 1], ctx);
    expect(page.items.map((w) => w.id)).toEqual(['unsplash:a', 'pexels:1']);
    expect(page.cursors).toEqual([2, null]);
    expect(page.errors).toEqual([]);
  });

  it('continue avec une source quand l’autre échoue, sans réessayer une clé manquante', async () => {
    vi.mocked(unsplash.unsplashTopic).mockRejectedValue(new ApiError('unsplash', 'missing_key', 'Clé Unsplash manquante'));
    vi.mocked(pexels.pexelsCurated).mockResolvedValue({ items: [mapPexels(pexelsPhoto(1), 360)], next: 2 });

    const page = await fetchFeedPage(queries, [1, 1], ctx);
    expect(page.items).toHaveLength(1);
    expect(page.cursors).toEqual([null, 2]);
    expect(page.errors[0]?.kind).toBe('missing_key');
  });

  it('échoue si toutes les sources échouent', async () => {
    vi.mocked(unsplash.unsplashTopic).mockRejectedValue(new ApiError('unsplash', 'network', 'x'));
    vi.mocked(pexels.pexelsCurated).mockRejectedValue(new ApiError('pexels', 'network', 'y'));
    await expect(fetchFeedPage(queries, [1, 1], ctx)).rejects.toMatchObject({ kind: 'network' });
  });

  it('filtre la couleur localement quand le serveur ne le fait pas', async () => {
    const blue = mapUnsplash(unsplashPhoto('bleu', { color: '#1e88e5' }), 360);
    const red = mapUnsplash(unsplashPhoto('rouge', { color: '#d32f2f' }), 360);
    vi.mocked(unsplash.unsplashCollection).mockResolvedValue({ items: [blue, red], next: null });
    const page = await fetchFeedPage([{ kind: 'unsplash-collection', id: 'c1' }], [1], {
      ...ctx,
      filters: { ...DEFAULT_FILTERS, color: 'blue' },
    });
    expect(page.items.map((w) => w.id)).toEqual(['unsplash:bleu']);
  });

  it('AMOLED : demande le noir aux serveurs et vérifie la couleur moyenne', async () => {
    const amoled = { ...DEFAULT_FILTERS, amoled: true };
    const resolved = resolveQueries({ key: 'k', queries, searchQuery: 'wallpaper' }, { filters: amoled, sources: allSources });
    expect(resolved).toEqual([
      { kind: 'unsplash-search', query: 'wallpaper' },
      { kind: 'pexels-search', query: 'wallpaper' },
    ]);
    expect(serverColor(resolved[0] as SourceQuery, amoled)).toBe('black');

    const night = mapUnsplash(unsplashPhoto('nuit', { color: '#0c0c0c' }), 360);
    const grey = mapUnsplash(unsplashPhoto('gris', { color: '#595959' }), 360);
    vi.mocked(unsplash.unsplashSearch).mockResolvedValue({ items: [night, grey], next: null });
    // Pixabay ne donne pas de couleur : on se fie à son filtre « black ».
    const pixabayItem = mapPixabay({
      id: 7,
      pageURL: 'https://pixabay.com/photos/7/',
      tags: 'night, sky',
      webformatURL: 'https://cdn.pixabay.com/photo/7_640.jpg',
      largeImageURL: 'https://cdn.pixabay.com/photo/7_1280.jpg',
      imageWidth: 3000,
      imageHeight: 5333,
      user: 'Lune',
      user_id: 3,
    });
    vi.mocked(pixabay.pixabaySearch).mockResolvedValue({ items: [pixabayItem], next: null });
    const page = await fetchFeedPage(
      [
        { kind: 'unsplash-search', query: 'wallpaper' },
        { kind: 'pixabay', query: 'wallpaper', order: 'popular' },
      ],
      [1, 1],
      { ...ctx, filters: amoled },
    );
    expect(page.items.map((w) => w.id)).toEqual(['unsplash:nuit', 'pixabay:7']);
    expect(vi.mocked(pixabay.pixabaySearch).mock.calls[0]?.[0].color).toBe('black');
  });

  it('transmet une teinte du nuancier aux serveurs', async () => {
    vi.mocked(pexels.pexelsSearch).mockResolvedValue({ items: [], next: null });
    vi.mocked(unsplash.unsplashSearch).mockResolvedValue({ items: [], next: null });
    const filters = { ...DEFAULT_FILTERS, color: '#2e7d32' as const };
    await fetchFeedPage(
      [
        { kind: 'pexels-search', query: 'forêt' },
        { kind: 'unsplash-search', query: 'forêt' },
      ],
      [1, 1],
      { ...ctx, filters },
    );
    expect(vi.mocked(pexels.pexelsSearch).mock.calls[0]?.[3]).toBe('#2e7d32');
    expect(vi.mocked(unsplash.unsplashSearch).mock.calls[0]?.[3]).toBe('#2e7d32');
  });

  it('garde les images NASA de taille inconnue et écarte les œuvres sans couleur filtrée', async () => {
    const galaxy = mapNasa({
      data: [{ nasa_id: 'PIA1', title: 'Galaxie', media_type: 'image' }],
      links: [{ href: 'https://images-assets.nasa.gov/image/PIA1/PIA1~thumb.jpg', rel: 'preview', render: 'image' }],
    });
    vi.mocked(nasa.nasaSearch).mockResolvedValue({ items: galaxy ? [galaxy] : [], next: null });
    const painting = mapArtwork({
      id: 1,
      title: 'Nuit',
      url: 'https://clevelandart.org/art/1',
      images: {
        web: { url: 'https://openaccess-cdn.clevelandart.org/1/1_web.jpg', width: '700', height: '893' },
        print: { url: 'https://openaccess-cdn.clevelandart.org/1/1_print.jpg', width: '2666', height: '3400' },
      },
    });
    vi.mocked(art.artSearch).mockResolvedValue({ items: painting ? [painting] : [], next: null });

    const all = await fetchFeedPage([{ kind: 'nasa', query: 'galaxy' }, { kind: 'art' }], [1, 1], ctx);
    expect(all.items.map((w) => w.id)).toEqual(['nasa:PIA1', 'art:1']);
    const blue = await fetchFeedPage([{ kind: 'nasa', query: 'galaxy' }, { kind: 'art' }], [1, 1], {
      ...ctx,
      filters: { ...DEFAULT_FILTERS, color: 'blue' },
    });
    expect(blue.items).toEqual([]);
  });

  it('pagine les images statiques sans filtre HD', async () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ ...mapPexels(pexelsPhoto(i, { width: 500, height: 900 }), 360) }));
    const first = await fetchFeedPage([{ kind: 'static', items }], [1], ctx);
    expect(first.items).toHaveLength(30);
    expect(first.cursors).toEqual([2]);
    const second = await fetchFeedPage([{ kind: 'static', items }], [2], ctx);
    expect(second.items).toHaveLength(15);
    expect(second.cursors).toEqual([null]);
  });
});
