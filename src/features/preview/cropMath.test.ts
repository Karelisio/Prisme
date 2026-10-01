import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampTransform,
  coverScale,
  cropFromTransform,
  fitStage,
  initialTransform,
  isDefaultTransform,
  transformFromCrop,
  zoomAt,
} from './cropMath';

const stage = { width: 400, height: 888 };
const portrait = { width: 3000, height: 6000 };
const landscape = { width: 6000, height: 4000 };

describe('recadrage', () => {
  it('centre l’image en mode « cover »', () => {
    const t = initialTransform(stage, portrait);
    expect(t.scale).toBeCloseTo(coverScale(stage, portrait));
    expect(t.y).toBe(0);
    expect(t.x).toBeCloseTo((400 - 3000 * t.scale) / 2);
    const crop = cropFromTransform(t, stage, portrait);
    expect(crop.height).toBeCloseTo(1);
    expect(crop.x + crop.width / 2).toBeCloseTo(0.5);
    expect(isDefaultTransform(t, stage, portrait)).toBe(true);
  });

  it('ne laisse jamais de bord vide', () => {
    const t = clampTransform({ scale: 0.01, x: 500, y: 500 }, stage, landscape);
    expect(t.scale).toBeCloseTo(coverScale(stage, landscape));
    expect(t.x).toBeLessThanOrEqual(0);
    expect(t.y).toBeLessThanOrEqual(0);
    expect(t.x + landscape.width * t.scale).toBeGreaterThanOrEqual(stage.width - 1e-6);
  });

  it('zoome autour du point touché et borne le zoom', () => {
    const t0 = initialTransform(stage, portrait);
    const point = { x: 200, y: 444 };
    const t1 = zoomAt(t0, 2, point, stage, portrait);
    expect(t1.scale).toBeCloseTo(t0.scale * 2);
    // Le point d'image sous le doigt ne bouge pas.
    const before = { x: (point.x - t0.x) / t0.scale, y: (point.y - t0.y) / t0.scale };
    const after = { x: (point.x - t1.x) / t1.scale, y: (point.y - t1.y) / t1.scale };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const t2 = zoomAt(t1, 100, point, stage, portrait);
    expect(t2.scale).toBeCloseTo(t0.scale * MAX_ZOOM);
    expect(isDefaultTransform(t1, stage, portrait)).toBe(false);
  });

  it('convertit transformation et recadrage dans les deux sens', () => {
    const t = zoomAt(initialTransform(stage, portrait), 2.5, { x: 100, y: 200 }, stage, portrait);
    const crop = cropFromTransform(t, stage, portrait);
    expect(crop.width / crop.height).toBeCloseTo((stage.width / stage.height) * (portrait.height / portrait.width));
    const back = transformFromCrop(crop, stage, portrait);
    expect(back.scale).toBeCloseTo(t.scale);
    expect(back.x).toBeCloseTo(t.x);
    expect(back.y).toBeCloseTo(t.y);
  });

  it('ajuste la scène au ratio physique de l’écran', () => {
    expect(fitStage({ width: 400, height: 888 }, 2.22)).toEqual({ width: 400, height: 888 });
    const letterboxed = fitStage({ width: 400, height: 800 }, 2.22);
    expect(letterboxed.height).toBe(800);
    expect(letterboxed.height / letterboxed.width).toBeCloseTo(2.22);
  });
});
