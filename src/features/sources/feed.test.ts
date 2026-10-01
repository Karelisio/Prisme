import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pexelsPhoto, unsplashPhoto } from './__fixtures__/photos';
import { type FeedContext, type SourceQuery, dedupe, fetchFeedPage, interleave, resolveQueries } from './feed';
import { mapPexels } from './pexels';
import { ApiError } from './types';
import { mapUnsplash } from './unsplash';

vi.mock('./unsplash', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./unsplash')>();
  return { ...actual, unsplashTopic: vi.fn(), unsplashSearch: vi.fn(), unsplashCollection: vi.fn() };
});
vi.mock('./pexels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pexels')>();
  return { ...actual, pexelsCurated: vi.fn(), pexelsSearch: vi.fn(), pexelsCollection: vi.fn() };
});

const unsplash = await import('./unsplash');
const pexels = await import('./pexels');

const ctx: FeedContext = {
  filters: { color: null, ratio: 'all' },
  screenRatio: 2.22,
  thumbWidth: 360,
  sources: { unsplash: true, pexels: true },
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
      { filters: { color: 'green', ratio: 'all' }, sources: ctx.sources },
    );
    expect(resolved).toEqual([
      { kind: 'unsplash-search', query: 'nature' },
      { kind: 'pexels-search', query: 'nature' },
    ]);
  });

  it('ignore les sources désactivées', () => {
    expect(resolveQueries({ key: 'k', queries }, { filters: ctx.filters, sources: { unsplash: false, pexels: true } })).toEqual([
      { kind: 'pexels-curated' },
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
      filters: { color: 'blue', ratio: 'all' },
    });
    expect(page.items.map((w) => w.id)).toEqual(['unsplash:bleu']);
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
