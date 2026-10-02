import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { type FavoriteEntry, colorSortKey, sortFavorites, sortLabel, toHsl } from './sort';

const wp = (id: string, extra: Partial<Wallpaper> = {}): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 1080,
  height: 2400,
  color: '#204080',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
  ...extra,
});

const entry = (w: Wallpaper, addedAt: number): FavoriteEntry => ({ wallpaper: w, addedAt });
const ids = (list: Wallpaper[]) => list.map((w) => w.id);

describe('tri des favoris', () => {
  it('convertit une couleur en teinte, saturation et luminosité', () => {
    expect(toHsl('#ff0000')).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(toHsl('#00ff00')?.h).toBe(120);
    expect(toHsl('#0000ff')?.h).toBe(240);
    expect(toHsl('#808080')).toEqual({ h: 0, s: 0, l: 128 / 255 });
    expect(toHsl('pas une couleur')).toBeNull();
  });

  it('range les teintes, puis les gris, puis les couleurs inconnues', () => {
    const key = (hex: string) => colorSortKey(hex);
    expect(key('#d32f2f')[0]).toBe(0);
    expect(key('#d32f2f')[1]).toBeLessThan(key('#1e88e5')[1]);
    expect(key('#9e9e9e')[0]).toBe(1);
    expect(key('#050505')[0]).toBe(1);
    expect(key('#fafafa')[0]).toBe(1);
    // « #808080 » est la couleur donnée aux fonds dont la source ne la fournit pas.
    expect(key('#808080')[0]).toBe(2);
    expect(key('nope')[0]).toBe(2);
  });

  it('par date d’ajout : le plus récent d’abord', () => {
    const list = [entry(wp('a'), 1), entry(wp('b'), 3), entry(wp('c'), 2)];
    expect(ids(sortFavorites(list, 'added'))).toEqual(['b', 'c', 'a']);
  });

  it('par couleur : du rouge au rose, du sombre au clair dans une teinte, puis les gris', () => {
    const list = [
      entry(wp('gris-clair', { color: '#cccccc' }), 1),
      entry(wp('inconnu', { color: '#808080' }), 2),
      entry(wp('rose', { color: '#d81b60' }), 3),
      entry(wp('bleu-clair', { color: '#7aa7ff' }), 4),
      entry(wp('rouge', { color: '#d32f2f' }), 5),
      entry(wp('bleu-sombre', { color: '#0d3c7a' }), 6),
      entry(wp('gris-sombre', { color: '#333333' }), 7),
      entry(wp('vert', { color: '#43a047' }), 8),
    ];
    expect(ids(sortFavorites(list, 'color'))).toEqual(['rouge', 'vert', 'bleu-sombre', 'bleu-clair', 'rose', 'gris-sombre', 'gris-clair', 'inconnu']);
  });

  it('par source : ordre alphabétique des noms, puis le plus récent d’abord', () => {
    const list = [
      entry(wp('p1', { source: 'pexels' }), 1),
      entry(wp('u1', { source: 'unsplash' }), 2),
      entry(wp('c1', { source: 'creation' }), 3),
      entry(wp('u2', { source: 'unsplash' }), 4),
      entry(wp('a1', { source: 'art' }), 5),
    ];
    // Cleveland Museum of Art, Création Prisme, Pexels, Unsplash.
    expect(ids(sortFavorites(list, 'source'))).toEqual(['a1', 'c1', 'p1', 'u2', 'u1']);
  });

  it('par nom : alphabétique sans tenir compte des accents ni de la casse, nombres dans l’ordre', () => {
    const list = [
      entry(wp('1', { alt: 'zèbre' }), 1),
      entry(wp('2', { alt: 'Éclipse' }), 2),
      entry(wp('3', { alt: 'abeille' }), 3),
      entry(wp('4', { alt: 'Fond 10' }), 4),
      entry(wp('5', { alt: 'Fond 2' }), 5),
      entry(wp('6', { alt: 'éclipse' }), 6),
    ];
    // « Éclipse » et « éclipse » sont égaux : le plus récemment ajouté d'abord.
    expect(ids(sortFavorites(list, 'name'))).toEqual(['3', '6', '2', '5', '4', '1']);
  });

  it('ne modifie pas la liste d’origine et nomme chaque tri', () => {
    const list = [entry(wp('a'), 1), entry(wp('b'), 2)];
    sortFavorites(list, 'added');
    expect(list.map((e) => e.wallpaper.id)).toEqual(['a', 'b']);
    expect(sortLabel('color')).toBe('Couleur');
    expect(sortLabel('added')).toBe('Date d’ajout');
  });
});
