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

  it('annulation : réapplique le fond précédent de chaque écran concerné', () => {
    const h = (id: string, wallpaperId: string, target: 'home' | 'lock' | 'both', at: number, extra = {}) => ({ id, wallpaperId, target, at, ...extra });
    expect(m.planUndo([])).toBeNull();
    // Un seul fond appliqué : rien d'antérieur à restaurer.
    expect(m.planUndo([h('1', 'a', 'both', 1)])).toEqual({ undone: h('1', 'a', 'both', 1), steps: [], missing: ['home', 'lock'] });

    // Même image sur les deux écrans auparavant : une seule application « les deux ».
    const crop = { x: 0.1, y: 0, width: 0.5, height: 1 };
    const both = m.planUndo([h('3', 'c', 'both', 3), h('2', 'b', 'both', 2, { crop }), h('1', 'a', 'home', 1)]);
    expect(both?.steps).toEqual([{ entry: h('2', 'b', 'both', 2, { crop }), target: 'both' }]);

    // Écrans différents auparavant : un fond par écran.
    const split = m.planUndo([h('3', 'c', 'both', 3), h('2', 'b', 'lock', 2), h('1', 'a', 'home', 1)]);
    expect(split?.steps).toEqual([
      { entry: h('1', 'a', 'home', 1), target: 'home' },
      { entry: h('2', 'b', 'lock', 2), target: 'lock' },
    ]);
    expect(split?.missing).toEqual([]);

    // Seul l'écran modifié est restauré ; l'autre écran n'avait pas de fond Prisme.
    const lockOnly = m.planUndo([h('2', 'b', 'lock', 2), h('1', 'a', 'home', 1)]);
    expect(lockOnly).toMatchObject({ steps: [], missing: ['lock'] });
    const homeOnly = m.planUndo([h('3', 'c', 'home', 3), h('2', 'b', 'lock', 2), h('1', 'a', 'both', 1)]);
    expect(homeOnly?.steps).toEqual([{ entry: h('1', 'a', 'both', 1), target: 'home' }]);
  });
});
