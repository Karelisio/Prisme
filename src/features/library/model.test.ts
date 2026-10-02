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

describe('étiquettes', () => {
  const withFavorites = (...ids: string[]) => ids.reduce((s, id, i) => m.toggleFavorite(s, wp(id), i + 1), m.EMPTY_LIBRARY);

  it('nettoie le texte saisi', () => {
    expect(m.cleanTag('  #  plage   de sable ')).toBe('plage de sable');
    expect(m.cleanTag('###')).toBe('');
    expect(m.cleanTag('x'.repeat(40))).toHaveLength(m.MAX_TAG_LENGTH);
    expect(m.sameTag('Été', 'ete')).toBe(true);
    expect(m.sameTag('plage', 'Plage')).toBe(true);
    expect(m.sameTag('plage', 'plages')).toBe(false);
  });

  it('ajoute et retire des étiquettes sur un favori, sans doublon', () => {
    let s = withFavorites('a', 'b');
    s = m.addTag(s, 'a', 'Plage');
    s = m.addTag(s, 'a', ' plage ');
    s = m.addTag(s, 'a', 'été');
    expect(s.tags).toEqual({ a: ['Plage', 'été'] });
    // L'écriture déjà utilisée dans la bibliothèque est reprise.
    s = m.addTag(s, 'b', 'PLAGE');
    expect(s.tags.b).toEqual(['Plage']);
    expect(m.hasTag(s, 'b', 'plage')).toBe(true);

    s = m.removeTag(s, 'a', 'PLAGE');
    expect(s.tags).toEqual({ a: ['été'], b: ['Plage'] });
    s = m.removeTag(s, 'a', 'été');
    expect(s.tags).toEqual({ b: ['Plage'] });
    // Retirer une étiquette absente ne change rien.
    expect(m.removeTag(s, 'a', 'été')).toBe(s);
  });

  it('refuse les étiquettes vides, les fonds non favoris et l’excès d’étiquettes', () => {
    const s = withFavorites('a');
    expect(m.addTag(s, 'a', '  # ')).toBe(s);
    expect(m.addTag(s, 'inconnu', 'plage')).toBe(s);
    let full = s;
    for (let i = 0; i < m.MAX_TAGS_PER_WALLPAPER + 3; i++) full = m.addTag(full, 'a', `étiquette ${i}`);
    expect(full.tags.a).toHaveLength(m.MAX_TAGS_PER_WALLPAPER);
  });

  it('retirer le favori retire ses étiquettes', () => {
    let s = withFavorites('a', 'b');
    s = m.addTag(m.addTag(s, 'a', 'plage'), 'b', 'nuit');
    s = m.toggleFavorite(s, wp('a'), 9);
    expect(s.tags).toEqual({ b: ['nuit'] });
    // Même si le fond reste dans une collection.
    s = m.createCollection(s, 'c', 'C', 1, wp('b'));
    s = m.toggleFavorite(s, wp('b'), 10);
    expect(s.tags).toEqual({});
    expect(s.items.b).toBeDefined();
  });

  it('compte les étiquettes, les plus utilisées d’abord', () => {
    let s = withFavorites('a', 'b', 'c');
    for (const [id, tag] of [
      ['a', 'nuit'],
      ['b', 'Nuit'],
      ['c', 'nuit'],
      ['a', 'plage'],
      ['b', 'été'],
    ] as const) {
      s = m.addTag(s, id, tag);
    }
    expect(m.tagCounts(s)).toEqual([
      { tag: 'nuit', count: 3 },
      { tag: 'été', count: 1 },
      { tag: 'plage', count: 1 },
    ]);
    expect(m.tagCounts(m.EMPTY_LIBRARY)).toEqual([]);
  });
});

describe('collection reçue et tri', () => {
  it('crée une collection avec les fonds reçus, sans écraser les fiches déjà connues', () => {
    const known = { ...wp('a'), alt: 'ma fiche' };
    let s = m.toggleFavorite(m.EMPTY_LIBRARY, known, 1);
    s = m.importCollection(s, 'c1', '  Reçue  ', [wp('a'), wp('b'), wp('b'), wp('c')], 5);
    expect(s.collections[0]).toEqual({ id: 'c1', name: 'Reçue', createdAt: 5, itemIds: ['a', 'b', 'c'] });
    expect(s.items.a?.alt).toBe('ma fiche');
    expect(Object.keys(s.items).sort()).toEqual(['a', 'b', 'c']);
    // Les fonds ajoutés sont référencés par la collection : le nettoyage les garde.
    expect(m.prune(s).items.c).toBeDefined();
    expect(m.importCollection(m.EMPTY_LIBRARY, 'c2', '', [wp('z')], 1).collections[0]?.name).toBe('Sans titre');
  });

  it('mémorise le tri choisi et refuse un tri inconnu', () => {
    const s = m.setSort(m.EMPTY_LIBRARY, 'color');
    expect(s.sort).toBe('color');
    expect(m.setSort(s, 'au-hasard' as never)).toBe(s);
    expect(m.EMPTY_LIBRARY.sort).toBe('added');
  });
});
