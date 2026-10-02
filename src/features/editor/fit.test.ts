import { describe, expect, it } from 'vitest';
import { FIT_MODES, fitLayout, isLandscape } from './fit';
import { type Geometry, containPlacement, resolvePlacement } from './geometry';

const source = { width: 3000, height: 2000 };
const out = { width: 1080, height: 2400 };
const geometry: Geometry = { turns: 0, mirror: false, straighten: 0, view: { x: 0.5, y: 0.5, zoom: 1 } };

describe('ajustement de la photo', () => {
  it('propose les trois modes, avec les libellés attendus', () => {
    expect(FIT_MODES.map((m) => m.label)).toEqual(['Remplir (recadrer)', 'Entière, bords flous', 'Entière, couleur dominante']);
    expect(FIT_MODES.map((m) => m.mode)).toEqual(['fill', 'blur', 'color']);
  });

  it('reconnaît une photo en paysage', () => {
    expect(isLandscape({ width: 3000, height: 2000 })).toBe(true);
    expect(isLandscape({ width: 2000, height: 3000 })).toBe(false);
    expect(isLandscape({ width: 2000, height: 2000 })).toBe(false);
  });

  it('« Remplir » recadre la zone choisie, sans copie derrière', () => {
    const layout = fitLayout('fill', source, geometry, out);
    expect(layout.backdrop).toBeNull();
    expect(layout.photo).toEqual(resolvePlacement(source, geometry, out));
  });

  it('« bords flous » montre la photo entière sur une copie agrandie ; « couleur » sur un fond uni', () => {
    const blur = fitLayout('blur', source, geometry, out);
    expect(blur.photo).toEqual(containPlacement(source, geometry, out));
    expect(blur.backdrop).not.toBeNull();
    expect(blur.backdrop!.scale).toBeGreaterThan(blur.photo.scale);
    const color = fitLayout('color', source, geometry, out);
    expect(color.photo).toEqual(blur.photo);
    expect(color.backdrop).toBeNull();
  });

  it('en mode entier, la photo paysage est bien plus petite qu’en mode « remplir »', () => {
    expect(fitLayout('color', source, geometry, out).photo.scale).toBeLessThan(fitLayout('fill', source, geometry, out).photo.scale / 3);
  });
});
