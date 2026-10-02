import { describe, expect, it } from 'vitest';
import { parseHex, toHex } from './color';
import { dominantColors, nearestColor, quantize } from './quantize';

function rgbaOf(parts: [number, number, number, number][]) {
  const out: number[] = [];
  for (const [r, g, b, count] of parts) for (let i = 0; i < count; i++) out.push(r, g, b, 255);
  return out;
}

describe('couleurs', () => {
  it('lit et écrit « #rrggbb », avec la forme courte et les erreurs', () => {
    expect(parseHex('#1b1464')).toEqual([27, 20, 100]);
    expect(parseHex('fa0')).toEqual([255, 170, 0]);
    expect(parseHex('pas une couleur')).toEqual([0, 0, 0]);
    expect(toHex([27, 20, 100])).toBe('#1b1464');
    expect(toHex([300, -4, 127.6])).toBe('#ff0080');
  });
});

describe('quantification', () => {
  it('retrouve les moyennes de deux groupes bien séparés, avec leurs effectifs', () => {
    const rgb: number[] = [];
    for (let i = 0; i < 600; i++) rgb.push(200 + (i % 5), 20, 20);
    for (let i = 0; i < 400; i++) rgb.push(20, 20, 210 + (i % 3));
    const clusters = quantize(rgb, 2);
    expect(clusters).toHaveLength(2);
    const [big, small] = clusters;
    expect(big!.count).toBe(600);
    expect(small!.count).toBe(400);
    expect(big!.color[0]).toBeCloseTo(202, 0);
    expect(big!.color[2]).toBeCloseTo(20, 0);
    expect(small!.color[2]).toBeCloseTo(211, 0);
  });

  it('ne renvoie pas plus de groupes que de couleurs distinctes, ni plus que demandé', () => {
    const rgb = [10, 10, 10, 10, 10, 10, 200, 0, 0];
    expect(quantize(rgb, 8)).toHaveLength(2);
    expect(quantize([5, 6, 7], 4)).toHaveLength(1);
    expect(quantize([], 4)).toEqual([]);
    const many: number[] = [];
    for (let i = 0; i < 300; i++) many.push((i * 37) % 256, (i * 91) % 256, (i * 17) % 256);
    expect(quantize(many, 16).length).toBeLessThanOrEqual(16);
  });

  it('est déterministe', () => {
    const many: number[] = [];
    for (let i = 0; i < 2000; i++) many.push((i * 37) % 256, (i * 91) % 256, (i * 17) % 256);
    expect(quantize(many, 12)).toEqual(quantize(many, 12));
  });

  it('trouve la couleur de palette la plus proche', () => {
    const palette = [
      [0, 0, 0],
      [255, 0, 0],
      [0, 0, 255],
    ] as const;
    expect(nearestColor(palette, 250, 10, 10)).toBe(1);
    expect(nearestColor(palette, 20, 20, 200)).toBe(2);
    expect(nearestColor(palette, 5, 5, 5)).toBe(0);
  });
});

describe('couleurs dominantes', () => {
  it('la plus présente d’abord, teintes proches fusionnées', () => {
    const image = rgbaOf([
      [30, 90, 200, 700],
      [34, 94, 205, 100],
      [220, 40, 40, 150],
      [240, 240, 80, 50],
    ]);
    const colors = dominantColors(image, 3);
    expect(colors).toHaveLength(3);
    const [first, second] = colors.map(parseHex);
    expect(first![2]).toBeGreaterThan(180);
    expect(first![0]).toBeLessThan(60);
    expect(second![0]).toBeGreaterThan(200);
    expect(second![2]).toBeLessThan(60);
  });

  it('une image unie donne une seule couleur ; les pixels transparents sont ignorés', () => {
    expect(dominantColors(rgbaOf([[12, 200, 100, 300]]), 4)).toEqual([toHex([12, 200, 100])]);
    const withHoles = [...rgbaOf([[200, 0, 0, 50]]), 0, 255, 0, 0, 0, 255, 0, 0];
    expect(dominantColors(withHoles, 3)).toEqual(['#c80000']);
    expect(dominantColors([], 3)).toEqual([]);
  });
});
