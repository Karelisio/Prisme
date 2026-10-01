import { describe, expect, it } from 'vitest';
import { DEFAULT_EDIT, coverCrop, effectiveCrop, isNeutral, textFontSize, zoomCrop } from './render';

describe('rendu de l’éditeur', () => {
  it('recadrage « cover » centré', () => {
    const portrait = coverCrop({ width: 3000, height: 6000 }, 1080 / 2400);
    expect(portrait.height).toBe(1);
    expect(portrait.width).toBeCloseTo(0.9);
    expect(portrait.x).toBeCloseTo(0.05);
    const landscape = coverCrop({ width: 6000, height: 4000 }, 0.5);
    expect(landscape.width).toBeCloseTo(1 / 3);
    expect(landscape.x + landscape.width / 2).toBeCloseTo(0.5);
    const tall = coverCrop({ width: 1000, height: 4000 }, 0.5);
    expect(tall.width).toBe(1);
    expect(tall.height).toBeCloseTo(0.5);
  });

  it('zoom autour du centre du recadrage', () => {
    const z = zoomCrop({ x: 0.1, y: 0.2, width: 0.6, height: 0.6 }, 2);
    expect(z).toEqual({ x: 0.25, y: 0.35, width: 0.3, height: 0.3 });
    expect(zoomCrop({ x: 0, y: 0, width: 1, height: 1 }, 0.5)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('utilise le recadrage choisi s’il existe', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.5, height: 0.5 };
    expect(effectiveCrop({ width: 100, height: 200 }, crop, 10, 20)).toBe(crop);
  });

  it('détecte l’absence de retouche et dimensionne le texte', () => {
    expect(isNeutral(DEFAULT_EDIT)).toBe(true);
    expect(isNeutral({ ...DEFAULT_EDIT, text: { ...DEFAULT_EDIT.text, value: '  ' } })).toBe(true);
    expect(isNeutral({ ...DEFAULT_EDIT, blur: 0.1 })).toBe(false);
    expect(textFontSize(0, 1000)).toBe(40);
    expect(textFontSize(1, 1000)).toBe(140);
  });
});
