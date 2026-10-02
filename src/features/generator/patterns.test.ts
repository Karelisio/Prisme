import { describe, expect, it } from 'vitest';
import { completePalette } from './color';
import { GEOMETRIC_SHAPES, PATTERN_KINDS, type PatternKind, type PatternOptions, type Scene, type Shape, buildPattern, drawScene } from './patterns';

const PALETTE = completePalette(['#e9ddff', '#ffd8e4', '#313033'], ['#6750a4', '#625b71', '#7d5260']);
const W = 270;
const H = 594;
const BASE: PatternOptions = { scale: 0.5, thickness: 0.4, rotation: 0, shape: 'triangles', seed: 7 };

const build = (kind: PatternKind, patch: Partial<PatternOptions> = {}, w = W, h = H, palette: readonly string[] = PALETTE) =>
  buildPattern(kind, palette, { ...BASE, ...patch }, w, h);

type Poly = Extract<Shape, { type: 'poly' }>;
const polys = (scene: Scene) => scene.shapes.filter((s): s is Poly => s.type === 'poly');

/** Point dans un polygone (lancer de rayon). */
function inside(points: readonly number[], x: number, y: number): boolean {
  let hit = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[2 * i] as number;
    const yi = points[2 * i + 1] as number;
    const xj = points[2 * j] as number;
    const yj = points[2 * j + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Part des points d'une grille régulière (décalée pour éviter les arêtes) recouverte par au moins un polygone. */
function coverage(scene: Scene, w: number, h: number): number {
  const shapes = polys(scene);
  let covered = 0;
  let total = 0;
  for (let i = 0; i < 30; i++) {
    for (let j = 0; j < 60; j++) {
      const x = ((i + 0.37) / 30) * w;
      const y = ((j + 0.61) / 60) * h;
      total++;
      if (shapes.some((s) => inside(s.points, x, y))) covered++;
    }
  }
  return covered / total;
}

function area(points: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    sum += (points[i] as number) * (points[j + 1] as number) - (points[j] as number) * (points[i + 1] as number);
  }
  return Math.abs(sum) / 2;
}

function numbers(shape: Shape): number[] {
  switch (shape.type) {
    case 'poly':
    case 'line':
      return shape.points;
    case 'circle':
      return [shape.x, shape.y, shape.r];
    case 'sector':
      return [shape.x, shape.y, shape.r, shape.start, shape.end];
  }
}

describe('motifs : propriétés communes', () => {
  it('sept motifs, tous non vides et tracés dans l’écran', () => {
    expect(PATTERN_KINDS).toHaveLength(7);
    for (const kind of PATTERN_KINDS) {
      for (const scale of [0, 0.5, 1]) {
        for (const thickness of [0, 1]) {
          const scene = build(kind, { scale, thickness, rotation: 25 });
          expect(scene.shapes.length, `${kind} ${scale} ${thickness}`).toBeGreaterThan(0);
          expect(scene.shapes.length, `${kind} ${scale} ${thickness}`).toBeLessThan(6000);
          expect(scene.background).toMatch(/^#[0-9a-f]{6}$/);
          for (const shape of scene.shapes) {
            expect(numbers(shape).every(Number.isFinite)).toBe(true);
            if (shape.type === 'poly') expect(shape.fill).toMatch(/^#[0-9a-f]{6}$/);
            if (shape.type === 'poly' || shape.type === 'line') expect(shape.points.length % 2).toBe(0);
          }
        }
      }
    }
  });

  it('même graine, même composition ; une autre graine change le motif', () => {
    for (const kind of PATTERN_KINDS) {
      expect(build(kind)).toEqual(build(kind));
      expect(build(kind, { seed: 8 }), kind).not.toEqual(build(kind, { seed: 7 }));
    }
  });

  it('aperçu et export identiques : la composition est la même à toute taille', () => {
    const ratio = 4;
    for (const kind of PATTERN_KINDS) {
      for (const rotation of [0, 33]) {
        const small = build(kind, { rotation }, W, H);
        const large = build(kind, { rotation }, W * ratio, H * ratio);
        expect(large.shapes.length, kind).toBe(small.shapes.length);
        expect(large.background).toBe(small.background);
        small.shapes.forEach((shape, i) => {
          const other = large.shapes[i] as Shape;
          expect(other.type).toBe(shape.type);
          if (shape.type === 'poly' && other.type === 'poly') expect(other.fill).toBe(shape.fill);
          const a = numbers(shape);
          const b = numbers(other);
          expect(b.length).toBe(a.length);
          // Les longueurs (pixels) grandissent d'un facteur 4 ; les angles des secteurs, eux, ne changent pas.
          const scaled = shape.type === 'sector' ? [4, 4, 4, 1, 1] : a.map(() => ratio);
          a.forEach((value, k) => expect(b[k] as number).toBeCloseTo(value * (scaled[k] as number), 3));
        });
      }
    }
  });

  it('une palette de trois couleurs suffit : les autres teintes sont dérivées', () => {
    for (const kind of PATTERN_KINDS) {
      const scene = build(kind, {}, W, H, ['#0f2027', '#2c5364', '#a8c0ff']);
      expect(scene.shapes.length).toBeGreaterThan(0);
      expect(JSON.stringify(scene)).not.toContain('undefined');
    }
  });

  it('une rotation d’un tour complet redonne le motif de départ', () => {
    for (const kind of ['geometric', 'dots', 'wavy', 'stripes', 'isometric'] as const) {
      const a = build(kind, { rotation: 0 });
      const b = build(kind, { rotation: 360 });
      expect(b.shapes.length, kind).toBe(a.shapes.length);
      a.shapes.forEach((shape, i) => numbers(shape).forEach((v, k) => expect(numbers(b.shapes[i] as Shape)[k] as number).toBeCloseTo(v, 3)));
    }
  });
});

describe('motif géométrique', () => {
  it('trois formes de tuiles : triangles, hexagones, losanges', () => {
    expect(GEOMETRIC_SHAPES.map((s) => s.value)).toEqual(['triangles', 'hexagons', 'diamonds']);
    const vertices = { triangles: 3, hexagons: 6, diamonds: 4 } as const;
    for (const { value } of GEOMETRIC_SHAPES) {
      const scene = build('geometric', { shape: value });
      expect(polys(scene).every((p) => p.points.length === vertices[value] * 2)).toBe(true);
    }
  });

  it('sans écart les tuiles pavent tout l’écran, même tourné ; avec écart la jointure apparaît', () => {
    for (const { value } of GEOMETRIC_SHAPES) {
      for (const rotation of [0, 30, -47]) {
        expect(coverage(build('geometric', { shape: value, thickness: 0, rotation }), W, H), `${value} ${rotation}`).toBe(1);
      }
      // Au maximum de l'écart, chaque tuile est réduite à 66 % : elle couvre 0,66² de sa maille.
      const gapped = coverage(build('geometric', { shape: value, thickness: 1 }), W, H);
      expect(gapped).toBeGreaterThan(0.35);
      expect(gapped).toBeLessThan(0.55);
    }
  });

  it('l’échelle règle le nombre de tuiles', () => {
    for (const { value } of GEOMETRIC_SHAPES) {
      const coarse = build('geometric', { shape: value, scale: 0 }).shapes.length;
      const fine = build('geometric', { shape: value, scale: 1 }).shapes.length;
      expect(fine).toBeGreaterThan(coarse * 4);
    }
  });
});

describe('pois', () => {
  it('aucun pois n’en touche un autre, quelle que soit la taille choisie', () => {
    for (const thickness of [0, 0.5, 1]) {
      const circles = build('dots', { thickness, rotation: 20 }).shapes.flatMap((s) => (s.type === 'circle' ? [s] : []));
      expect(circles.length).toBeGreaterThan(100);
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i]!;
          const b = circles[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r - 1e-6);
        }
      }
    }
  });

  it('l’épaisseur grossit les pois', () => {
    const radius = (thickness: number) => Math.max(...build('dots', { thickness }).shapes.map((s) => (s.type === 'circle' ? s.r : 0)));
    expect(radius(1)).toBeGreaterThan(radius(0) * 2.5);
  });
});

describe('vagues', () => {
  it('les lignes voisines ne se touchent jamais', () => {
    for (let seed = 0; seed < 25; seed++) {
      for (const thickness of [0, 0.5, 1]) {
        for (const scale of [0, 0.5, 1]) {
          const lines = build('wavy', { seed, thickness, scale, rotation: 0 }).shapes.flatMap((s) => (s.type === 'line' ? [s] : []));
          expect(lines.length).toBeGreaterThan(3);
          for (let k = 0; k + 1 < lines.length; k++) {
            const a = lines[k]!;
            const b = lines[k + 1]!;
            expect(b.points.length).toBe(a.points.length);
            let gap = Infinity;
            for (let i = 0; i < a.points.length; i += 2) gap = Math.min(gap, (b.points[i + 1] as number) - (a.points[i + 1] as number));
            expect(gap, `graine ${seed}`).toBeGreaterThanOrEqual(a.width);
          }
        }
      }
    }
  });

  it('l’échelle règle la densité de lignes, l’épaisseur leur largeur', () => {
    const lines = (patch: Partial<PatternOptions>) => build('wavy', patch).shapes.flatMap((s) => (s.type === 'line' ? [s] : []));
    expect(lines({ scale: 1 }).length).toBeGreaterThan(lines({ scale: 0 }).length * 3);
    expect((lines({ thickness: 1 })[0] as { width: number }).width).toBeGreaterThan((lines({ thickness: 0 })[0] as { width: number }).width * 3);
  });
});

describe('rayures', () => {
  it('la part de l’écran couverte suit l’épaisseur, quelle que soit la graine', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const thickness of [0, 0.5, 1]) {
        const scene = build('stripes', { seed, thickness, rotation: 0 });
        let covered = 0;
        const samples = 1000;
        for (let i = 0; i < samples; i++) {
          const x = ((i + 0.5) / samples) * W;
          if (polys(scene).some((s) => inside(s.points, x, H / 2))) covered++;
        }
        const expected = 0.2 + 0.65 * thickness;
        expect(Math.abs(covered / samples - expected), `graine ${seed}, épaisseur ${thickness}`).toBeLessThan(0.07);
      }
    }
  });

  it('la rotation incline les bandes', () => {
    const scene = build('stripes', { rotation: 90 });
    const first = polys(scene).find((p) => p.points.every((v) => Number.isFinite(v))) as Poly;
    const xs = first.points.filter((_, i) => i % 2 === 0);
    const ys = first.points.filter((_, i) => i % 2 === 1);
    // À 90° les bandes sont horizontales : plus larges que hautes.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
  });
});

describe('Bauhaus', () => {
  it('une grille de cellules carrées dont le nombre de colonnes suit l’échelle', () => {
    // La première forme tracée est le fond de la première cellule : sa largeur donne celle de la grille.
    const columns = (scale: number) => {
      const [first] = polys(build('bauhaus', { scale })) as [Poly];
      return Math.round(W / ((first.points[2] as number) - (first.points[0] as number)));
    };
    expect(columns(0)).toBe(3);
    expect(columns(0.5)).toBe(4);
    expect(columns(1)).toBe(7);
  });

  it('les fonds de cellule recouvrent tout l’écran', () => {
    expect(coverage(build('bauhaus'), W, H)).toBe(1);
  });

  it('l’épaisseur change toujours la composition, quelle que soit la graine', () => {
    for (let seed = 0; seed < 60; seed++) {
      expect(build('bauhaus', { seed, thickness: 0 }), `graine ${seed}`).not.toEqual(build('bauhaus', { seed, thickness: 1 }));
    }
  });

  it('mêle des formes pleines, des quarts et demi-cercles et des bandes selon la graine', () => {
    const types = new Set<string>();
    for (let seed = 0; seed < 40; seed++) for (const shape of build('bauhaus', { seed }).shapes) types.add(shape.type);
    expect([...types].sort()).toEqual(['circle', 'poly', 'sector']);
  });
});

describe('terrazzo', () => {
  it('les éclats ne se chevauchent pas', () => {
    const chips = polys(build('terrazzo', { thickness: 0.8 }));
    expect(chips.length).toBeGreaterThan(150);
    const boxes = chips.map((chip) => {
      const xs = chip.points.filter((_, i) => i % 2 === 0);
      const ys = chip.points.filter((_, i) => i % 2 === 1);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    const touches = (a: Poly, b: Poly) => {
      for (let k = 0; k < a.points.length; k += 2) if (inside(b.points, a.points[k] as number, a.points[k + 1] as number)) return true;
      return false;
    };
    let overlaps = 0;
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0) continue;
        if (touches(chips[i]!, chips[j]!) || touches(chips[j]!, chips[i]!)) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });

  it('la densité et la taille des éclats suivent les réglages', () => {
    const count = (patch: Partial<PatternOptions>) => build('terrazzo', patch).shapes.length;
    expect(count({ thickness: 1 })).toBeGreaterThan(count({ thickness: 0 }) * 1.8);
    expect(count({ scale: 1 })).toBeGreaterThan(count({ scale: 0 }) * 3);
  });
});

describe('grille isométrique', () => {
  it('trois losanges égaux par cube, qui pavent tout l’écran sans écart', () => {
    const scene = build('isometric', { thickness: 0 });
    expect(coverage(scene, W, H)).toBe(1);
    // Un cube de côté R se compose de trois losanges d'aire R² · √3 / 2 (hexagone de largeur W / 5 pour l'échelle 0,5).
    const side = W / 5 / Math.sqrt(3);
    const inner = polys(scene).filter((p) => p.points.every((v, k) => (k % 2 === 0 ? v > 0 && v < W : v > 0 && v < H)));
    expect(inner.length).toBeGreaterThan(30);
    for (const p of inner) expect(area(p.points)).toBeCloseTo((side * side * Math.sqrt(3)) / 2, 3);
  });

  it('trois tons : dessus clair, côté moyen, côté sombre', () => {
    const fills = new Set(polys(build('isometric')).map((p) => p.fill));
    expect(fills.size).toBe(3);
  });

  it('l’épaisseur ouvre une jointure entre les faces', () => {
    expect(coverage(build('isometric', { thickness: 1 }), W, H)).toBeLessThan(0.95);
  });
});

describe('tracé de la scène', () => {
  it('trace le fond puis chaque forme dans l’ordre', () => {
    const calls: [string, ...unknown[]][] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_, prop: string) => (...args: unknown[]) => calls.push([prop, ...args]),
        set: (_, prop: string, value: unknown) => {
          calls.push([`=${prop}`, value]);
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const scene: Scene = {
      background: '#112233',
      bleed: 1,
      shapes: [
        { type: 'poly', points: [0, 0, 10, 0, 10, 10], fill: '#ff0000', bleed: true },
        { type: 'circle', x: 5, y: 5, r: 3, fill: '#00ff00' },
        { type: 'sector', x: 0, y: 0, r: 4, start: 0, end: 1, fill: '#0000ff', bleed: false },
        { type: 'line', points: [0, 0, 5, 5, 9, 2], width: 2, stroke: '#ffffff' },
      ],
    };
    drawScene(ctx, scene, 100, 200);
    const names = calls.map((c) => c[0]);
    expect(names[0]).toBe('save');
    expect(calls.find((c) => c[0] === 'fillRect')).toEqual(['fillRect', 0, 0, 100, 200]);
    expect(calls.find((c) => c[0] === '=fillStyle')).toEqual(['=fillStyle', '#112233']);
    expect(names.filter((n) => n === 'fill')).toHaveLength(3);
    expect(names.filter((n) => n === 'stroke')).toHaveLength(2);
    expect(names.filter((n) => n === 'arc')).toHaveLength(2);
    expect(names.at(-1)).toBe('restore');
  });
});
