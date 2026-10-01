import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import * as m from './model';

const wp = (id: string): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 1080,
  height: 2400,
  color: '#000000',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

describe('bibliothèque', () => {
  it('ajoute et retire un favori, et nettoie le catalogue', () => {
    let s = m.toggleFavorite(m.EMPTY_LIBRARY, wp('a'), 1);
    expect(s.favorites).toEqual({ a: 1 });
    expect(s.items.a?.id).toBe('a');
    s = m.toggleFavorite(s, wp('a'), 2);
    expect(s.favorites).toEqual({});
    expect(s.items).toEqual({});
  });

  it('garde un fond retiré des favoris s’il reste dans une collection', () => {
    let s = m.toggleFavorite(m.EMPTY_LIBRARY, wp('a'), 1);
    s = m.createCollection(s, 'c1', '  Nuit  ', 1, wp('a'));
    expect(s.collections[0]).toMatchObject({ id: 'c1', name: 'Nuit', itemIds: ['a'] });
    s = m.toggleFavorite(s, wp('a'), 2);
    expect(s.items.a).toBeDefined();
    s = m.setInCollection(s, 'c1', wp('a'), false);
    expect(s.items.a).toBeUndefined();
  });

  it('gère les collections : ajout sans doublon, renommage, suppression', () => {
    let s = m.createCollection(m.EMPTY_LIBRARY, 'c1', '', 1);
    expect(s.collections[0]?.name).toBe('Sans titre');
    s = m.setInCollection(s, 'c1', wp('a'), true);
    s = m.setInCollection(s, 'c1', wp('a'), true);
    s = m.setInCollection(s, 'c1', wp('b'), true);
    expect(s.collections[0]?.itemIds).toEqual(['b', 'a']);
    s = m.renameCollection(s, 'c1', 'Plages');
    expect(s.collections[0]?.name).toBe('Plages');
    expect(m.renameCollection(s, 'c1', '   ')).toBe(s);
    s = m.deleteCollection(s, 'c1');
    expect(s.collections).toEqual([]);
    expect(s.items).toEqual({});
  });

  it('limite l’historique et nettoie les fonds sortis de l’historique', () => {
    let s = m.EMPTY_LIBRARY;
    for (let i = 0; i < m.HISTORY_LIMIT + 5; i++) {
      s = m.addHistory(s, { id: `h${i}`, wallpaperId: `w${i}`, target: 'both', at: i }, wp(`w${i}`));
    }
    expect(s.history).toHaveLength(m.HISTORY_LIMIT);
    expect(s.history[0]?.id).toBe(`h${m.HISTORY_LIMIT + 4}`);
    expect(Object.keys(s.items)).toHaveLength(m.HISTORY_LIMIT);
    s = m.clearHistory(s);
    expect(s.items).toEqual({});
  });
});
