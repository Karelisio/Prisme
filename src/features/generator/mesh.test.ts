import { describe, expect, it } from 'vitest';
import { completePalette, hexToOklab, parseHex } from './color';
import { MESH_MAX_POINTS, MESH_MIN_POINTS, clampPointCount, meshColorAt, meshImage, meshKernel, meshPoints, meshResolution } from './mesh';

const PALETTE = completePalette(['#e9ddff', '#ffd8e4', '#313033'], ['#6750a4', '#625b71', '#7d5260']);
const ASPECT = 2.2;

/** Écart-type de la clarté (moyenne des canaux) d'une image RGBA. */
function spread(data: Uint8ClampedArray): number {
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 4) values.push(((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number)) / 3);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

describe('dégradé organique : placement des points', () => {
  it('le nombre de points reste entre 4 et 6', () => {
    expect([MESH_MIN_POINTS, MESH_MAX_POINTS]).toEqual([4, 6]);
    expect([clampPointCount(1), clampPointCount(4), clampPointCount(5.4), clampPointCount(6), clampPointCount(40), clampPointCount(Number.NaN)]).toEqual([4, 4, 5, 6, 6, 5]);
  });

  it('autant de points que demandé, dans l’image, aux couleurs de la palette', () => {
    for (const count of [4, 5, 6]) {
      for (let seed = 0; seed < 20; seed++) {
        const points = meshPoints(seed, count, PALETTE, ASPECT);
        expect(points).toHaveLength(count);
        for (const p of points) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(1);
          expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
        }
        // Le fond et l'accent doux de la palette sont toujours présents, sans doublon de couleur.
        const colors = points.map((p) => p.color);
        expect(colors).toContain(PALETTE[0]);
        expect(colors).toContain(PALETTE[1]);
        expect(new Set(colors).size).toBe(count);
      }
    }
  });

  it('même graine, mêmes points ; une autre graine, une autre composition', () => {
    expect(meshPoints(5, 5, PALETTE, ASPECT)).toEqual(meshPoints(5, 5, PALETTE, ASPECT));
    expect(meshPoints(6, 5, PALETTE, ASPECT)).not.toEqual(meshPoints(5, 5, PALETTE, ASPECT));
    expect(meshPoints(5, 6, PALETTE, ASPECT)).not.toEqual(meshPoints(5, 5, PALETTE, ASPECT));
  });

  it('les points sont bien répartis : jamais collés l’un à l’autre', () => {
    for (let seed = 0; seed < 200; seed++) {
      const points = meshPoints(seed, 6, PALETTE, ASPECT);
      let nearest = Infinity;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          nearest = Math.min(nearest, Math.hypot((points[i]!.x - points[j]!.x), (points[i]!.y - points[j]!.y) * ASPECT));
        }
      }
      expect(nearest, `graine ${seed}`).toBeGreaterThan(0.12);
    }
  });
});

describe('dégradé organique : interpolation', () => {
  const points = meshPoints(3, 5, PALETTE, ASPECT);
  const labs = points.map((p) => hexToOklab(p.color));

  it('plus la douceur monte, plus le fondu s’étale', () => {
    let previous = meshKernel(0);
    for (const softness of [0.25, 0.5, 0.75, 1]) {
      const kernel = meshKernel(softness);
      expect(kernel.soften).toBeGreaterThan(previous.soften);
      expect(kernel.power).toBeLessThan(previous.power);
      previous = kernel;
    }
    expect(meshKernel(-3)).toEqual(meshKernel(0));
    expect(meshKernel(9)).toEqual(meshKernel(1));
  });

  it('au pied d’un point, sa couleur domine ; ailleurs le résultat reste dans l’enveloppe des couleurs', () => {
    const [L, a, b] = meshColorAt(points, labs, points[0]!.x, points[0]!.y, 0.2, ASPECT);
    const own = labs[0]!;
    expect(Math.hypot(L - own[0], a - own[1], b - own[2])).toBeLessThan(0.06);
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const [l, aa, bb] = meshColorAt(points, labs, i / 20, j / 20, 0.5, ASPECT);
        for (const [value, axis] of [[l, 0], [aa, 1], [bb, 2]] as const) {
          expect(value).toBeGreaterThanOrEqual(Math.min(...labs.map((c) => c[axis])) - 1e-9);
          expect(value).toBeLessThanOrEqual(Math.max(...labs.map((c) => c[axis])) + 1e-9);
        }
      }
    }
  });

  it('l’image ne fait aucun saut d’un pixel au suivant', () => {
    const width = 120;
    const height = 264;
    for (const softness of [0, 0.5, 1]) {
      const data = meshImage(points, softness, 3, width, height, ASPECT);
      let jump = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) jump = Math.max(jump, Math.abs((data[i + c] as number) - (data[i + 4 + c] as number)));
        }
      }
      expect(jump, `douceur ${softness}`).toBeLessThan(28);
    }
  });
});

describe('dégradé organique : image calculée', () => {
  const points = meshPoints(11, 5, PALETTE, ASPECT);

  it('une image RGBA opaque de la taille demandée, reproductible', () => {
    const data = meshImage(points, 0.5, 11, 40, 88, ASPECT);
    expect(data).toHaveLength(40 * 88 * 4);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
    expect(meshImage(points, 0.5, 11, 40, 88, ASPECT)).toEqual(data);
    expect(meshImage(points, 0.5, 12, 40, 88, ASPECT)).not.toEqual(data);
    expect(meshImage(points, 0.9, 11, 40, 88, ASPECT)).not.toEqual(data);
  });

  it('la douceur atténue les contrastes', () => {
    const contrast = [0, 0.25, 0.5, 0.75, 1].map((softness) => spread(meshImage(points, softness, 11, 60, 132, ASPECT)));
    for (let i = 1; i < contrast.length; i++) expect(contrast[i] as number).toBeLessThan(contrast[i - 1] as number);
  });

  it('même composition à toutes les tailles : couleur moyenne et allure d’ensemble', () => {
    const small = meshImage(points, 0.5, 11, 30, 66, ASPECT);
    const large = meshImage(points, 0.5, 11, 120, 264, ASPECT);
    const mean = (data: Uint8ClampedArray, c: number) => {
      let sum = 0;
      for (let i = c; i < data.length; i += 4) sum += data[i] as number;
      return sum / (data.length / 4);
    };
    for (const c of [0, 1, 2]) expect(Math.abs(mean(small, c) - mean(large, c))).toBeLessThan(3);
    // Chaque pixel de la petite image est proche de la moyenne des 4 × 4 pixels de la grande.
    let worst = 0;
    for (let y = 0; y < 66; y++) {
      for (let x = 0; x < 30; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) sum += large[((y * 4 + dy) * 120 + x * 4 + dx) * 4 + c] as number;
          worst = Math.max(worst, Math.abs(sum / 16 - (small[(y * 30 + x) * 4 + c] as number)));
        }
      }
    }
    expect(worst).toBeLessThan(10);
  });

  it('les couleurs restent celles de la palette : aucun pixel ne sort de sa plage', () => {
    const data = meshImage(points, 0.5, 11, 40, 88, ASPECT);
    const channels = points.map((p) => parseHex(p.color));
    for (let c = 0; c < 3; c++) {
      const lows = Math.min(...channels.map((rgb) => rgb[c] as number)) - 6;
      const highs = Math.max(...channels.map((rgb) => rgb[c] as number)) + 6;
      for (let i = c; i < data.length; i += 4) {
        expect(data[i] as number).toBeGreaterThanOrEqual(lows);
        expect(data[i] as number).toBeLessThanOrEqual(highs);
      }
    }
  });

  it('calcul à basse résolution : un quart de la taille de rendu', () => {
    expect(meshResolution(1080, 2400)).toEqual({ width: 270, height: 600 });
    expect(meshResolution(390, 858)).toEqual({ width: 98, height: 216 });
    expect(meshResolution(60, 132)).toEqual({ width: 24, height: 53 });
    expect(meshResolution(10, 22).width).toBe(10);
  });
});
