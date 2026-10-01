import { describe, expect, it } from 'vitest';
import { VARIANTS, variantCrop } from './variants';

const image = { width: 3000, height: 6000 };
const screen = { width: 1080, height: 2400 };

describe('fonds liés', () => {
  it('chaque variante modifie vraiment l’image', () => {
    for (const v of VARIANTS) {
      const changed = v.params.blur > 0 || v.params.dim > 0 || v.params.grayscale || (v.zoom ?? 1) > 1;
      expect(changed, v.key).toBe(true);
    }
  });

  it('le gros plan resserre le recadrage autour de son centre', () => {
    const zoom = VARIANTS.find((v) => v.key === 'zoom')!;
    const base = variantCrop(VARIANTS[0]!, image, undefined, screen);
    const close = variantCrop(zoom, image, undefined, screen);
    expect(close.width).toBeCloseTo(base.width / 1.8);
    expect(close.x + close.width / 2).toBeCloseTo(base.x + base.width / 2);
    expect(close.y + close.height / 2).toBeCloseTo(base.y + base.height / 2);
  });

  it('reprend le recadrage choisi dans l’aperçu', () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.55 };
    expect(variantCrop(VARIANTS[1]!, image, crop, screen)).toBe(crop);
  });
});
