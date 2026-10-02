import { describe, expect, it } from 'vitest';
import {
  CELL_RATIO,
  MOSAIC_MAX_RATIO,
  MOSAIC_MIN_RATIO,
  columnCount,
  columnHeights,
  layoutMosaic,
  mosaicColumns,
  tileRatio,
  visibleTiles,
} from './mosaic';

/** Suite pseudo-aléatoire reproductible (LCG) : pas de test qui change d'une exécution à l'autre. */
function ratios(count: number, seed = 7): number[] {
  let state = seed;
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return 0.62 + (state / 4294967296) * 1.48;
  });
}

describe('format des vignettes', () => {
  it('suit le format de l’image, dans des bornes raisonnables', () => {
    expect(tileRatio({ width: 1000, height: 1500 })).toBe(1.5);
    expect(tileRatio({ width: 3000, height: 6000 })).toBe(2);
    expect(tileRatio({ width: 1000, height: 100 })).toBe(MOSAIC_MIN_RATIO);
    expect(tileRatio({ width: 100, height: 1000 })).toBe(MOSAIC_MAX_RATIO);
  });

  it('retombe sur le format de la grille quand la taille est inconnue', () => {
    expect(tileRatio({ width: 0, height: 0 })).toBe(CELL_RATIO);
    expect(tileRatio({ width: 800, height: 0 })).toBe(CELL_RATIO);
  });
});

describe('colonnes de la grille', () => {
  it('compte les colonnes d’une mosaïque selon la largeur disponible', () => {
    expect(mosaicColumns(388)).toBe(2); // téléphone en portrait
    expect(mosaicColumns(600)).toBe(3);
    expect(mosaicColumns(868)).toBe(5); // paysage ou tablette : plafonné
    expect(mosaicColumns(2000)).toBe(5);
    expect(mosaicColumns(0)).toBe(2);
    expect(mosaicColumns(120)).toBe(2);
  });

  it('applique le nombre de colonnes choisi, ou celui de la mosaïque', () => {
    expect(columnCount('2', 388)).toBe(2);
    expect(columnCount('3', 388)).toBe(3);
    expect(columnCount('4', 388)).toBe(4);
    expect(columnCount('mosaic', 388)).toBe(2);
    expect(columnCount('mosaic', 600)).toBe(3);
  });
});

describe('répartition de la mosaïque', () => {
  it('place chaque vignette dans la colonne la moins haute, la plus à gauche en cas d’égalité', () => {
    // Deux colonnes de 100 px, écart de 8 px.
    const layout = layoutMosaic([2, 1, 1, 1, 2], 2, 208, 8);
    expect(layout.tiles.map((t) => t.column)).toEqual([0, 1, 1, 0, 1]);
    expect(layout.tiles.map((t) => t.y)).toEqual([0, 0, 108, 208, 216]);
    expect(layout.tiles.map((t) => t.height)).toEqual([200, 100, 100, 100, 200]);
    expect(layout.tiles.map((t) => t.x)).toEqual([0, 108, 108, 0, 108]);
    expect(layout.tiles.every((t) => t.width === 100)).toBe(true);
    // La mosaïque s'arrête au bas de la colonne la plus longue (sans l'écart final).
    expect(layout.height).toBe(416);
  });

  it('remplit la première rangée de gauche à droite', () => {
    const layout = layoutMosaic([1.5, 1.5, 1.5, 1.5], 4, 400, 0);
    expect(layout.tiles.map((t) => t.column)).toEqual([0, 1, 2, 3]);
    expect(layout.tiles.map((t) => t.index)).toEqual([0, 1, 2, 3]);
  });

  it('garde les colonnes équilibrées : l’écart ne dépasse jamais une vignette', () => {
    for (const columns of [2, 3, 4, 5]) {
      const layout = layoutMosaic(ratios(240, columns), columns, 388, 8);
      const heights = columnHeights(layout);
      const tallest = Math.max(...layout.tiles.map((t) => t.height));
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(tallest + 8);
      expect(layout.height).toBe(Math.max(...heights));
    }
  });

  it('ne déplace aucune vignette quand la page suivante arrive', () => {
    const all = ratios(60);
    const first = layoutMosaic(all.slice(0, 30), 3, 388, 8);
    const more = layoutMosaic(all, 3, 388, 8);
    expect(more.tiles.slice(0, 30)).toEqual(first.tiles);
  });

  it('ne superpose jamais deux vignettes d’une même colonne', () => {
    const layout = layoutMosaic(ratios(120), 3, 388, 8);
    for (let column = 0; column < 3; column++) {
      const tiles = layout.tiles.filter((t) => t.column === column);
      tiles.slice(1).forEach((tile, i) => {
        const above = tiles[i]!;
        expect(tile.y).toBe(above.y + above.height + 8);
      });
    }
  });

  it('gère une liste vide et une seule colonne', () => {
    expect(layoutMosaic([], 2, 388)).toEqual({ columns: 2, tiles: [], height: 0 });
    const single = layoutMosaic([1, 2], 1, 100, 10);
    expect(single.tiles.map((t) => t.y)).toEqual([0, 110]);
    expect(single.height).toBe(310);
  });

  it('ne garde que les vignettes de la fenêtre visible', () => {
    const layout = layoutMosaic([2, 2, 2, 2, 2, 2], 2, 208, 8); // colonnes de 100 px, vignettes de 200 px
    // Rangées à 0, 208 et 416 : une fenêtre de 250 à 420 touche les deux dernières.
    expect(visibleTiles(layout, 250, 420).map((t) => t.index)).toEqual([2, 3, 4, 5]);
    expect(visibleTiles(layout, 0, 10).map((t) => t.index)).toEqual([0, 1]);
    expect(visibleTiles(layout, 1000, 1200)).toEqual([]);
  });
});
