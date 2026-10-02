import { describe, expect, it } from 'vitest';
import { LAYOUTS, type Cell, type LayoutId, defaultLayout, layoutCells, layoutInfo, photoWindow } from './layouts';

const W = 1080;
const H = 2400;
const opts = (gap = 0, radius = 0) => ({ gap, radius });
const GRID_IDS: LayoutId[] = ['stack2', 'side2', 'big2small', 'bands3', 'grid4', 'big3small'];
const POLAROID_IDS: LayoutId[] = ['polaroid2', 'polaroid3', 'polaroid4'];

const area = (c: Cell) => c.width * c.height;
const left = (c: Cell) => c.cx - c.width / 2;
const top = (c: Cell) => c.cy - c.height / 2;

/** Rectangle englobant d'une carte tournée. */
function bounds(c: Cell) {
  const cos = Math.abs(Math.cos(c.rotation));
  const sin = Math.abs(Math.sin(c.rotation));
  const hx = (c.width * cos + c.height * sin) / 2;
  const hy = (c.width * sin + c.height * cos) / 2;
  return { left: c.cx - hx, right: c.cx + hx, top: c.cy - hy, bottom: c.cy + hy };
}

describe('catalogue des dispositions', () => {
  it('propose trois dispositions pour 2, 3 et 4 photos, dont des polaroïds', () => {
    for (const count of [2, 3, 4]) {
      const ids = LAYOUTS.filter((l) => l.count === count).map((l) => l.id);
      expect(ids).toHaveLength(3);
      expect(ids.some((id) => id.startsWith('polaroid'))).toBe(true);
    }
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    expect(new Set(LAYOUTS.map((l) => l.description)).size).toBe(LAYOUTS.length);
  });

  it('chaque disposition produit autant de cases que de photos annoncées', () => {
    for (const { id, count } of LAYOUTS) expect(layoutCells(id, W, H, opts(8, 16))).toHaveLength(count);
  });

  it('choisit une disposition d’après le nombre de photos déjà là', () => {
    expect(layoutInfo(defaultLayout(2)).count).toBe(2);
    expect(layoutInfo(defaultLayout(3)).count).toBe(3);
    expect(layoutInfo(defaultLayout(4)).count).toBe(4);
    expect(layoutInfo(defaultLayout(7)).count).toBe(4);
    expect(layoutInfo(defaultLayout(0)).count).toBe(3);
  });
});

describe('dispositions en cases jointives', () => {
  it('sans espacement, les cases couvrent tout l’écran sans se chevaucher', () => {
    for (const id of GRID_IDS) {
      const cells = layoutCells(id, W, H, opts());
      expect(cells.reduce((sum, c) => sum + area(c), 0)).toBeCloseTo(W * H, 3);
      for (const c of cells) {
        expect(left(c)).toBeGreaterThanOrEqual(-1e-9);
        expect(top(c)).toBeGreaterThanOrEqual(-1e-9);
        expect(left(c) + c.width).toBeLessThanOrEqual(W + 1e-9);
        expect(top(c) + c.height).toBeLessThanOrEqual(H + 1e-9);
      }
      cells.forEach((a, i) =>
        cells.slice(i + 1).forEach((b) => {
          const overlapX = Math.min(left(a) + a.width, left(b) + b.width) - Math.max(left(a), left(b));
          const overlapY = Math.min(top(a) + a.height, top(b) + b.height) - Math.max(top(a), top(b));
          expect(overlapX > 1e-6 && overlapY > 1e-6).toBe(false);
        }),
      );
    }
  });

  it('l’espacement vaut la marge extérieure et l’écart entre les cases', () => {
    const [first, second] = layoutCells('stack2', W, H, opts(24));
    expect(first && left(first)).toBeCloseTo(24);
    expect(first && top(first)).toBeCloseTo(24);
    expect(first?.width).toBeCloseTo(W - 48);
    expect(first && second && top(second) - (top(first) + first.height)).toBeCloseTo(24);
    expect(second && top(second) + second.height).toBeCloseTo(H - 24);

    const cells = layoutCells('grid4', W, H, opts(10));
    const [a, b, c] = cells;
    expect(a && b && left(b) - (left(a) + a.width)).toBeCloseTo(10);
    expect(a && c && top(c) - (top(a) + a.height)).toBeCloseTo(10);
    expect(a && c?.width).toBeCloseTo(a?.width ?? 0);
  });

  it('range les cases de haut en bas puis de gauche à droite', () => {
    const cells = layoutCells('grid4', W, H, opts(8));
    expect(cells.map((c) => [c.cx < W / 2 ? 'g' : 'd', c.cy < H / 2 ? 'h' : 'b'].join(''))).toEqual(['gh', 'dh', 'gb', 'db']);
    const side = layoutCells('side2', W, H, opts(8));
    expect(side[0] && side[1] && side[0].cx < side[1].cx).toBe(true);
  });

  it('une grande case domine les petites', () => {
    const [big, a, b] = layoutCells('big2small', W, H, opts());
    expect(big?.height).toBeCloseTo(H * 0.6);
    expect(big?.width).toBe(W);
    expect(a?.width).toBeCloseTo(W / 2);
    expect(b?.width).toBeCloseTo(W / 2);
    const big3 = layoutCells('big3small', W, H, opts());
    expect(big3[0]?.height).toBeCloseTo((H * 2) / 3);
    expect(big3.slice(1).every((c) => Math.abs(c.width - W / 3) < 1e-6)).toBe(true);
  });

  it('trois bandes égales', () => {
    const cells = layoutCells('bands3', W, H, opts());
    expect(cells.every((c) => Math.abs(c.height - H / 3) < 1e-6 && c.width === W)).toBe(true);
  });

  it('le rayon des coins ne dépasse pas la moitié du petit côté de chaque case', () => {
    const cells = layoutCells('grid4', 100, 400, opts(0, 500));
    for (const c of cells) {
      expect(c.radius).toBeCloseTo(Math.min(c.width, c.height) / 2);
      expect(c.photoRadius).toBe(c.radius);
    }
    expect(layoutCells('stack2', W, H, opts(0, 16))[0]?.radius).toBe(16);
  });

  it('borne l’espacement pour que les cases ne disparaissent pas', () => {
    const cells = layoutCells('grid4', W, H, opts(10_000));
    expect(cells.every((c) => c.width > 0 && c.height > 0)).toBe(true);
    expect(layoutCells('stack2', W, H, opts(Number.NaN, Number.NaN))[0]?.width).toBe(W);
    expect(layoutCells('stack2', W, H, opts(-5))[0]?.width).toBe(W);
  });

  it('même géométrie à toute résolution : l’aperçu est une réduction de l’export', () => {
    const big = layoutCells('big3small', 1080, 2400, opts(16, 32));
    const small = layoutCells('big3small', 540, 1200, opts(8, 16));
    big.forEach((c, i) => {
      const s = small[i];
      expect(s?.cx).toBeCloseTo(c.cx / 2);
      expect(s?.cy).toBeCloseTo(c.cy / 2);
      expect(s?.width).toBeCloseTo(c.width / 2);
      expect(s?.height).toBeCloseTo(c.height / 2);
      expect(s?.radius).toBeCloseTo(c.radius / 2);
    });
  });

  it('la fenêtre photo d’une case jointive est la case entière', () => {
    const [cell] = layoutCells('stack2', W, H, opts(10));
    expect(cell).toBeDefined();
    if (!cell) return;
    const view = photoWindow(cell);
    expect(view).toEqual({ x: -cell.width / 2, y: -cell.height / 2, width: cell.width, height: cell.height });
    expect(cell.framed).toBe(false);
    expect(cell.rotation).toBe(0);
  });
});

describe('polaroïds éparpillés', () => {
  it('cartes inclinées, cadrées, entièrement dans l’écran', () => {
    for (const [w, h] of [
      [1080, 2400],
      [1440, 3200],
      [1080, 1920],
    ] as const) {
      for (const id of POLAROID_IDS) {
        for (const gap of [0, 12, 24]) {
          for (const c of layoutCells(id, w, h, opts(gap * 2.6, 40))) {
            const b = bounds(c);
            expect(b.left).toBeGreaterThanOrEqual(0);
            expect(b.top).toBeGreaterThanOrEqual(0);
            expect(b.right).toBeLessThanOrEqual(w);
            expect(b.bottom).toBeLessThanOrEqual(h);
            expect(c.framed).toBe(true);
            expect(c.rotation).not.toBe(0);
            expect(Math.abs(c.rotation)).toBeLessThan((10 * Math.PI) / 180);
          }
        }
      }
    }
  });

  it('fenêtre photo carrée, marge plus large en bas, comme un vrai polaroïd', () => {
    for (const cell of layoutCells('polaroid3', W, H, opts())) {
      const view = photoWindow(cell);
      expect(view.width).toBeCloseTo(view.height);
      expect(cell.inset.bottom).toBeGreaterThan(cell.inset.top * 2);
      expect(cell.inset.left).toBeCloseTo(cell.inset.right);
      // La fenêtre est centrée horizontalement dans la carte et reste dans ses bords.
      expect(view.x + view.width / 2).toBeCloseTo(0);
      expect(view.y).toBeGreaterThan(-cell.height / 2);
      expect(view.y + view.height).toBeLessThan(cell.height / 2);
    }
  });

  it('l’espacement réduit les cartes, plus ou moins selon la valeur', () => {
    const none = layoutCells('polaroid2', W, H, opts(0))[0];
    const some = layoutCells('polaroid2', W, H, opts(30))[0];
    const more = layoutCells('polaroid2', W, H, opts(60))[0];
    expect(none && some && some.width < none.width).toBe(true);
    expect(some && more && more.width < some.width).toBe(true);
    expect(none && more && more.width / none.width).toBeGreaterThan(0.8);
    // Les centres ne bougent pas.
    expect(some?.cx).toBe(none?.cx);
    expect(some?.cy).toBe(none?.cy);
  });

  it('les coins arrondis restent discrets sur la carte', () => {
    const [cell] = layoutCells('polaroid4', W, H, opts(0, 40));
    expect(cell && cell.radius).toBeGreaterThan(0);
    expect(cell && cell.radius).toBeLessThanOrEqual(16);
    expect(cell?.photoRadius).toBe(0);
    expect(layoutCells('polaroid4', W, H, opts(0, 0))[0]?.radius).toBe(0);
  });
});
