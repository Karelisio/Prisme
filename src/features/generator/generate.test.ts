import { describe, expect, it } from 'vitest';
import { gradientLine, mulberry32, randomize, schemePalette } from './generate';
import { schemeFromSeed } from '@/shared/theme/scheme';

describe('générateur', () => {
  it('aléatoire déterministe : même graine, même composition', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(Array.from({ length: 5 }, mulberry32(43))).not.toEqual(seqA);
  });

  it('dégradé : 0° va de bas en haut, 90° de gauche à droite, toujours centré', () => {
    const [x0, y0, x1, y1] = gradientLine(0, 100, 200);
    expect(x0).toBeCloseTo(50);
    expect(x1).toBeCloseTo(50);
    expect(y0).toBeCloseTo(200);
    expect(y1).toBeCloseTo(0);
    const [hx0, , hx1] = gradientLine(90, 100, 200);
    expect(hx0).toBeCloseTo(0);
    expect(hx1).toBeCloseTo(100);
    const [ax0, ay0, ax1, ay1] = gradientLine(37, 100, 200);
    expect((ax0 + ax1) / 2).toBeCloseTo(50);
    expect((ay0 + ay1) / 2).toBeCloseTo(100);
  });

  it('palette tirée des couleurs Material You et tirage aléatoire reproductible', () => {
    const palette = schemePalette(schemeFromSeed('#6750A4', false));
    palette.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/i));
    expect(randomize(1)).toEqual(randomize(1));
  });
});
