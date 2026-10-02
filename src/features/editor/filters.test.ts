import { describe, expect, it } from 'vitest';
import { luma, parseHex } from './color';
import {
  COOL,
  DEFAULT_FILTER,
  DUOTONE_PRESETS,
  FILTERS,
  type FilterKind,
  type FilterParams,
  VINTAGE,
  WARM,
  applyFilter,
  contrastLut,
  isFilterActive,
  materialDuotones,
  vignetteFactor,
} from './filters';
import { schemeFromSeed } from '@/shared/theme/scheme';

const filter = (kind: FilterKind, intensity = 1, extra: Partial<FilterParams> = {}): FilterParams => ({ ...DEFAULT_FILTER, kind, intensity, ...extra });

/** Applique le filtre à un seul pixel opaque. */
function pixel(rgb: [number, number, number], f: FilterParams) {
  const data = new Uint8ClampedArray([...rgb, 255]);
  applyFilter(data, 1, 1, f);
  return [...data] as [number, number, number, number];
}

describe('filtres photo', () => {
  it('propose les filtres demandés, dans l’ordre', () => {
    expect(FILTERS.map((f) => f.label)).toEqual(['Aucun', 'Noir et blanc', 'Sépia', 'Vintage', 'Duotone', 'Contraste', 'Froid', 'Chaud']);
  });

  it('« Aucun » et une intensité nulle ne changent rien', () => {
    for (const { kind } of FILTERS) {
      expect(pixel([200, 120, 40], filter(kind, 0))).toEqual([200, 120, 40, 255]);
    }
    expect(pixel([200, 120, 40], filter('none'))).toEqual([200, 120, 40, 255]);
    expect(isFilterActive(filter('sepia', 0))).toBe(false);
    expect(isFilterActive(filter('none', 1))).toBe(false);
    expect(isFilterActive(filter('warm', 0.3))).toBe(true);
  });

  it('ne touche jamais à la transparence', () => {
    for (const { kind } of FILTERS) {
      const data = new Uint8ClampedArray([10, 20, 30, 77]);
      applyFilter(data, 1, 1, filter(kind));
      expect(data[3]).toBe(77);
    }
  });

  it('noir et blanc : même gris que le filtre CSS « grayscale » utilisé jusque-là', () => {
    expect(pixel([255, 0, 0], filter('mono'))).toEqual([54, 54, 54, 255]);
    expect(pixel([0, 255, 0], filter('mono'))).toEqual([182, 182, 182, 255]);
    expect(pixel([0, 0, 255], filter('mono'))).toEqual([18, 18, 18, 255]);
    const [r, g, b] = pixel([90, 160, 210], filter('mono'));
    expect(r === g && g === b).toBe(true);
  });

  it('l’intensité fond le filtre avec l’image d’origine', () => {
    const half = pixel([255, 0, 0], filter('mono', 0.5));
    expect(Math.abs(half[0] - (255 + 54.2) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(half[1] - 27.1)).toBeLessThanOrEqual(1);
  });

  it('sépia : la matrice classique', () => {
    expect(pixel([255, 255, 255], filter('sepia'))).toEqual([255, 255, 239, 255]);
    const [r, g, b] = pixel([100, 100, 100], filter('sepia'));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('contraste : courbe en S qui garde noir et blanc, creuse les ombres et avive les lumières', () => {
    const lut = contrastLut(1);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(Math.abs(lut[128]! - 128)).toBeLessThanOrEqual(1);
    expect(lut[64]!).toBeLessThan(64);
    expect(lut[192]!).toBeGreaterThan(192);
    for (let i = 1; i < 256; i++) expect(lut[i]!).toBeGreaterThanOrEqual(lut[i - 1]!);
    expect([...contrastLut(0)]).toEqual(Array.from({ length: 256 }, (_, i) => i));
    // Saturation renforcée : l'écart entre canaux augmente.
    const [r, , b] = pixel([150, 100, 80], filter('contrast'));
    expect(r - b).toBeGreaterThan(150 - 80);
  });

  it('froid et chaud déplacent la balance des blancs dans des sens opposés', () => {
    const [cr, , cb] = pixel([128, 128, 128], filter('cool'));
    const [wr, , wb] = pixel([128, 128, 128], filter('warm'));
    expect(cb).toBeGreaterThan(cr);
    expect(wr).toBeGreaterThan(wb);
    expect(COOL.gain[2]).toBeGreaterThan(1);
    expect(WARM.gain[0]).toBeGreaterThan(1);
  });

  it('vintage : noirs relevés, blancs adoucis, tons chauds et délavés', () => {
    const black = pixel([0, 0, 0], filter('vintage'));
    expect(black[0]).toBeGreaterThanOrEqual(VINTAGE.lift - 1);
    expect(black[1]).toBeGreaterThanOrEqual(VINTAGE.lift - 1);
    const white = pixel([255, 255, 255], filter('vintage'));
    expect(white[0]).toBeLessThan(255);
    expect(white[2]).toBeLessThan(white[0]);
    // Délavé : une couleur vive perd en saturation.
    const [r, g, b] = pixel([250, 40, 40], filter('vintage'));
    expect(r - g).toBeLessThan(250 - 40);
    expect(r).toBeGreaterThan(g);
    expect(b).toBeDefined();
  });

  it('vintage : léger vignettage, coins plus sombres que le centre', () => {
    const size = 9;
    const data = new Uint8ClampedArray(size * size * 4).fill(180);
    applyFilter(data, size, size, filter('vintage'));
    const at = (x: number, y: number) => data[(y * size + x) * 4]!;
    expect(at(4, 4)).toBeGreaterThan(at(0, 0));
    expect(at(4, 4)).toBeGreaterThan(at(8, 8));
    expect(at(0, 0)).toBe(at(8, 8));
    expect(vignetteFactor(0, 0, 0.3)).toBe(1);
    expect(vignetteFactor(1, 1, 0.3)).toBeCloseTo(0.7);
    expect(vignetteFactor(0.2, 0.1, 0.3)).toBe(1);
  });

  it('duotone : noir aux couleurs des ombres, blanc à celles des lumières, gris entre les deux', () => {
    const f = filter('duotone', 1, { duotone: { shadow: '#102040', highlight: '#f0e0a0' } });
    expect(pixel([0, 0, 0], f)).toEqual([16, 32, 64, 255]);
    expect(pixel([255, 255, 255], f)).toEqual([240, 224, 160, 255]);
    const [r, g, b] = pixel([128, 128, 128], f);
    expect(r).toBeGreaterThan(16);
    expect(r).toBeLessThan(240);
    expect(g).toBeGreaterThan(32);
    expect(b).toBeGreaterThan(64);
    expect(b).toBeLessThan(160);
    // Une même luminance donne la même couleur, quelle que soit la teinte d'origine.
    expect(pixel([255, 0, 0], f)).toEqual(pixel([54, 54, 54], f));
  });

  it('les préréglages duotone ont des ombres plus sombres que leurs lumières', () => {
    expect(DUOTONE_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of DUOTONE_PRESETS) {
      const [sr, sg, sb] = parseHex(preset.shadow);
      const [hr, hg, hb] = parseHex(preset.highlight);
      expect(luma(sr, sg, sb), preset.id).toBeLessThan(luma(hr, hg, hb));
    }
  });

  it('duotone Material You : tiré de la palette du thème, ombres sombres et lumières claires', () => {
    for (const isDark of [false, true]) {
      const presets = materialDuotones(schemeFromSeed('#6750A4', isDark));
      expect(presets.map((p) => p.label)).toEqual(['Material You', 'Ton sur ton']);
      for (const p of presets) {
        expect(p.shadow).toMatch(/^#[0-9a-f]{6}$/);
        expect(p.highlight).toMatch(/^#[0-9a-f]{6}$/);
        const [sr, sg, sb] = parseHex(p.shadow);
        const [hr, hg, hb] = parseHex(p.highlight);
        expect(luma(sr, sg, sb)).toBeLessThan(60);
        expect(luma(hr, hg, hb)).toBeGreaterThan(190);
      }
    }
    // Les couleurs suivent le thème : une autre teinte donne un autre duotone.
    expect(materialDuotones(schemeFromSeed('#006a60', false))[0]!.shadow).not.toBe(materialDuotones(schemeFromSeed('#6750A4', false))[0]!.shadow);
  });
});
