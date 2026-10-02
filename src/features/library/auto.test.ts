import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { AUTO_PREFIX, RECENT_LIMIT, buildAutoCollections, colorFamily, isAutoId, recentlyAppliedIds, savedIds } from './auto';
import { EMPTY_LIBRARY, type HistoryEntry, type LibraryData } from './model';

const wp = (id: string, color: string, source: Wallpaper['source'] = 'unsplash'): Wallpaper => ({
  id,
  source,
  width: 1080,
  height: 2400,
  color,
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

const h = (id: string, wallpaperId: string, at: number): HistoryEntry => ({ id, wallpaperId, target: 'both', at });

function library(extra: Partial<LibraryData> = {}): LibraryData {
  const items = Object.fromEntries(
    [
      wp('unsplash:bleu', '#1e88e5'),
      wp('unsplash:bleu2', '#0d47a1'),
      wp('pexels:rouge', '#d32f2f', 'pexels'),
      wp('pexels:noir', '#050505', 'pexels'),
      wp('art:1', '#808080', 'art'),
      wp('unsplash:vert', '#43a047'),
    ].map((w) => [w.id, w]),
  );
  return { ...EMPTY_LIBRARY, items, ...extra };
}

describe('collections automatiques', () => {
  it('reconnaît leur identifiant', () => {
    expect(isAutoId(`${AUTO_PREFIX}recent`)).toBe(true);
    expect(isAutoId('c1')).toBe(false);
  });

  it('famille de teinte : ignore les fonds sans couleur connue', () => {
    expect(colorFamily({ color: '#1e88e5' })).toBe('blue');
    expect(colorFamily({ color: '#d32f2f' })).toBe('red');
    expect(colorFamily({ color: '#050505' })).toBe('black');
    expect(colorFamily({ color: '#808080' })).toBeNull();
    expect(colorFamily({ color: 'x' })).toBeNull();
  });

  it('fonds conservés : favoris récents d’abord, puis collections, sans doublon', () => {
    const lib = library({
      favorites: { 'unsplash:bleu': 1, 'pexels:rouge': 5 },
      collections: [{ id: 'c', name: 'C', createdAt: 1, itemIds: ['unsplash:bleu', 'unsplash:vert', 'inconnu'] }],
    });
    expect(savedIds(lib)).toEqual(['pexels:rouge', 'unsplash:bleu', 'unsplash:vert']);
  });

  it('récemment appliqués : fonds différents, du plus récent au plus ancien, limités', () => {
    const history = [h('1', 'unsplash:bleu', 1), h('2', 'pexels:rouge', 2), h('3', 'unsplash:bleu', 3), h('4', 'absent', 4)];
    expect(recentlyAppliedIds(history, library().items)).toEqual(['unsplash:bleu', 'pexels:rouge']);
    expect(recentlyAppliedIds(history, library().items, 1)).toEqual(['unsplash:bleu']);
    expect(RECENT_LIMIT).toBeGreaterThan(10);
  });

  it('construit les collections : récents, jamais appliqués, couleurs puis sources', () => {
    const lib = library({
      favorites: { 'unsplash:bleu': 5, 'unsplash:bleu2': 4, 'pexels:rouge': 3, 'pexels:noir': 2, 'art:1': 1 },
      collections: [{ id: 'c', name: 'C', createdAt: 1, itemIds: ['unsplash:vert'] }],
      history: [h('1', 'unsplash:bleu', 10), h('2', 'pexels:rouge', 20)],
    });
    const auto = buildAutoCollections(lib);
    const byId = Object.fromEntries(auto.map((c) => [c.id, c]));

    expect(auto.map((c) => c.id)).toEqual([
      'auto:recent',
      'auto:never',
      'auto:color:red',
      'auto:color:green',
      'auto:color:blue',
      'auto:color:black',
      'auto:source:unsplash',
      'auto:source:pexels',
      'auto:source:art',
    ]);
    expect(byId['auto:recent']?.ids).toEqual(['pexels:rouge', 'unsplash:bleu']);
    expect(byId['auto:never']?.ids).toEqual(['unsplash:bleu2', 'pexels:noir', 'art:1', 'unsplash:vert']);
    expect(byId['auto:color:blue']?.ids).toEqual(['unsplash:bleu', 'unsplash:bleu2']);
    expect(byId['auto:color:blue']?.name).toBe('Bleus');
    expect(byId['auto:color:black']?.name).toBe('Sombres');
    // La couleur inconnue (art) n'entre dans aucune famille.
    expect(auto.some((c) => c.id.startsWith('auto:color') && c.ids.includes('art:1'))).toBe(false);
    expect(byId['auto:source:unsplash']?.ids).toEqual(['unsplash:bleu', 'unsplash:bleu2', 'unsplash:vert']);
    expect(byId['auto:source:art']?.name).toBe('Cleveland Museum of Art');
  });

  it('n’affiche rien pour une bibliothèque vide', () => {
    expect(buildAutoCollections(EMPTY_LIBRARY)).toEqual([]);
  });

  it('un fond appliqué seulement hors historique reste « jamais appliqué »', () => {
    const lib = library({ favorites: { 'pexels:rouge': 1 } });
    expect(buildAutoCollections(lib).find((c) => c.id === 'auto:never')?.ids).toEqual(['pexels:rouge']);
    expect(buildAutoCollections(lib).some((c) => c.id === 'auto:recent')).toBe(false);
  });
});
