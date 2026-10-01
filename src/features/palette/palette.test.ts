import { Hct, argbFromHex } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { schemesFor, seedsFromPixels } from './palette';

function image(colors: [number, number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.reduce((n, [, , , count]) => n + count * 4, 0));
  let i = 0;
  for (const [r, g, b, count] of colors) {
    for (let k = 0; k < count; k++) {
      out.set([r, g, b, 255], i);
      i += 4;
    }
  }
  return out;
}

describe('palette Material You', () => {
  it('la couleur dominante et saturée devient la couleur source', () => {
    const seeds = seedsFromPixels(image([
      [30, 90, 200, 800],
      [200, 40, 40, 150],
      [240, 240, 240, 400],
    ]));
    expect(seeds.length).toBeGreaterThan(0);
    const hue = Hct.fromInt(seeds[0]!).hue;
    expect(hue).toBeGreaterThan(220);
    expect(hue).toBeLessThan(300);
  });

  it('propose plusieurs candidates distinctes quand l’image est variée', () => {
    const seeds = seedsFromPixels(image([
      [30, 90, 200, 500],
      [200, 40, 40, 500],
      [40, 160, 70, 500],
    ]));
    expect(new Set(seeds).size).toBe(seeds.length);
    expect(seeds.length).toBeGreaterThanOrEqual(2);
  });

  it('une image grise donne la couleur de repli de Google', () => {
    const seeds = seedsFromPixels(image([[128, 128, 128, 1000]]));
    expect(seeds).toEqual([argbFromHex('#4285f4')]);
  });

  it('calcule les schémas clair et sombre', () => {
    const { light, dark } = schemesFor('#1e88e5');
    expect(light.primary).not.toBe(dark.primary);
    expect(light.surface).toMatch(/^#/);
  });
});
