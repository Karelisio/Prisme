import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTER } from './filters';
import { DEFAULT_FIT } from './fit';
import { DEFAULT_EDIT, PIPELINE, activeStages, coverCrop, effectiveCrop, hasEffect, isNeutral, photoScale, resolveEdit, textFontSize, zoomCrop } from './render';

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

describe('ordre du rendu', () => {
  const geometry = { turns: 1 as const, mirror: false, straighten: 4, view: { x: 0.5, y: 0.5, zoom: 1 } };
  const everything = {
    ...DEFAULT_EDIT,
    blur: 0.3,
    dim: 0.2,
    grain: 0.1,
    gradient: { ...DEFAULT_EDIT.gradient, style: 'bottom' as const },
    text: { ...DEFAULT_EDIT.text, value: 'Bonjour' },
    geometry,
    fit: { mode: 'blur' as const, color: null },
    filter: { ...DEFAULT_FILTER, kind: 'sepia' as const },
    effect: { kind: 'pixel' as const, amount: 0.5 },
  };

  it('géométrie → ajustement → filtre → effet → réglages existants → texte', () => {
    expect(PIPELINE).toEqual(['geometry', 'fit', 'filter', 'effect', 'blur', 'dim', 'gradient', 'grain', 'text']);
    expect(activeStages(everything)).toEqual(PIPELINE);
  });

  it('n’active que les étapes utiles, toujours dans le même ordre', () => {
    expect(activeStages(DEFAULT_EDIT)).toEqual([]);
    expect(activeStages({ ...DEFAULT_EDIT, grain: 0.2, effect: { kind: 'paint', amount: 0.2 } })).toEqual(['effect', 'grain']);
    expect(activeStages({ ...DEFAULT_EDIT, text: { ...DEFAULT_EDIT.text, value: ' ' }, filter: { ...DEFAULT_FILTER, kind: 'warm', intensity: 0 } })).toEqual([]);
    expect(activeStages({ ...DEFAULT_EDIT, geometry, fit: { mode: 'color', color: '#112233' } })).toEqual(['geometry', 'fit']);
  });

  it('détecte un effet artistique, seul calcul à fractionner', () => {
    expect(hasEffect(DEFAULT_EDIT)).toBe(false);
    expect(hasEffect({ ...DEFAULT_EDIT, filter: { ...DEFAULT_FILTER, kind: 'mono' } })).toBe(false);
    expect(hasEffect(everything)).toBe(true);
  });
});

describe('réglages complets et migration', () => {
  it('complète les groupes absents avec leurs valeurs neutres', () => {
    const r = resolveEdit(DEFAULT_EDIT);
    expect(r.fit).toEqual(DEFAULT_FIT);
    expect(r.filter.kind).toBe('none');
    expect(r.effect.kind).toBe('none');
    expect(r.geometry).toBeUndefined();
  });

  it('l’ancien « noir et blanc » devient le filtre du même nom, à pleine intensité', () => {
    const r = resolveEdit({ ...DEFAULT_EDIT, grayscale: true });
    expect(r.filter.kind).toBe('mono');
    expect(r.filter.intensity).toBe(1);
    expect(isNeutral({ ...DEFAULT_EDIT, grayscale: true })).toBe(false);
  });

  it('un filtre choisi l’emporte sur l’ancien réglage', () => {
    const r = resolveEdit({ ...DEFAULT_EDIT, grayscale: true, filter: { ...DEFAULT_FILTER, kind: 'sepia', intensity: 0.4 } });
    expect(r.filter).toMatchObject({ kind: 'sepia', intensity: 0.4 });
  });

  it('isNeutral tient compte des filtres, effets, ajustement et orientation, pas du simple cadrage', () => {
    expect(isNeutral({ ...DEFAULT_EDIT, filter: { ...DEFAULT_FILTER, kind: 'vintage' } })).toBe(false);
    expect(isNeutral({ ...DEFAULT_EDIT, filter: { ...DEFAULT_FILTER, kind: 'vintage', intensity: 0 } })).toBe(true);
    expect(isNeutral({ ...DEFAULT_EDIT, effect: { kind: 'mosaic', amount: 0.5 } })).toBe(false);
    expect(isNeutral({ ...DEFAULT_EDIT, fit: { mode: 'blur', color: null } })).toBe(false);
    const geometry = { turns: 0 as const, mirror: false, straighten: 0, view: { x: 0.2, y: 0.7, zoom: 3 } };
    expect(isNeutral({ ...DEFAULT_EDIT, geometry })).toBe(true);
    expect(isNeutral({ ...DEFAULT_EDIT, geometry: { ...geometry, straighten: 1 } })).toBe(false);
    expect(isNeutral({ ...DEFAULT_EDIT, geometry: { ...geometry, mirror: true } })).toBe(false);
  });
});

describe('échelle du rendu final', () => {
  const size = { width: 1200, height: 2400 };
  const out = { width: 1080, height: 2400 };

  it('sans géométrie : celle du recadrage reçu ou du « cover »', () => {
    expect(photoScale(DEFAULT_EDIT, size, undefined, out)).toBeCloseTo(1);
    // Recadrage deux fois plus serré : la photo est agrandie deux fois plus.
    const crop = { x: 0.2, y: 0.2, width: 0.45, height: 0.45 };
    expect(photoScale(DEFAULT_EDIT, size, crop, out)).toBeCloseTo(2);
  });

  it('une photo tournée ou zoomée réclame plus de pixels : l’éditeur recharge alors une version plus définie', () => {
    const geometry = { turns: 1 as const, mirror: false, straighten: 0, view: { x: 0.5, y: 0.5, zoom: 1 } };
    expect(photoScale({ ...DEFAULT_EDIT, geometry }, size, undefined, out)).toBeCloseTo(2);
    expect(photoScale({ ...DEFAULT_EDIT, geometry: { ...geometry, turns: 0, view: { ...geometry.view, zoom: 3 } } }, size, undefined, out)).toBeCloseTo(3);
  });

  it('en mode « photo entière », la photo est réduite pour tenir dans l’écran', () => {
    const fit = { mode: 'color' as const, color: null };
    expect(photoScale({ ...DEFAULT_EDIT, fit }, size, undefined, out)).toBeCloseTo(0.9);
  });
});
