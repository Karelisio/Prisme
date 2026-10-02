import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURATED_PALETTES,
  DEFAULT_GENERATOR,
  type GeneratorParams,
  type GeneratorStyle,
  STYLES,
  STYLE_CONTROLS,
  STYLE_GROUPS,
  applyStyle,
  gradientLine,
  isPatternStyle,
  mulberry32,
  nextSeed,
  paletteOf,
  randomize,
  renderGenerated,
  resolveSettings,
  schemeAccents,
  schemePalette,
  styleSettings,
} from './generate';
import { PATTERN_KINDS } from './patterns';
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

describe('styles regroupés', () => {
  it('deux familles : dégradés et motifs ; chaque style a un libellé unique et ses réglages', () => {
    expect(STYLE_GROUPS.map((g) => g.label)).toEqual(['Dégradés', 'Motifs']);
    const labels = STYLES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(STYLES.map((s) => s.value)).size).toBe(STYLES.length);
    const family = (group: string) => STYLES.filter((s) => s.group === group).map((s) => s.value);
    expect(family('gradients')).toEqual(['solid', 'linear', 'radial', 'aurora', 'mesh']);
    for (const kind of PATTERN_KINDS) expect(family('patterns')).toContain(kind);
    // Les anciens styles restent disponibles.
    expect(family('patterns')).toEqual(expect.arrayContaining(['shapes', 'waves']));
    for (const { value } of STYLES) expect(STYLE_CONTROLS[value]).toBeDefined();
    expect(Object.keys(STYLE_CONTROLS).sort()).toEqual(STYLES.map((s) => s.value).sort());
  });

  it('chaque style n’expose que les réglages qui le concernent', () => {
    const keys = (style: GeneratorStyle) => STYLE_CONTROLS[style].map((c) => c.key);
    expect(keys('solid')).toEqual([]);
    expect(keys('linear')).toEqual(['angle']);
    expect(keys('mesh')).toEqual(['softness', 'points']);
    expect(keys('geometric')).toEqual(['shape', 'scale', 'thickness', 'rotation']);
    expect(keys('bauhaus')).not.toContain('rotation');
    expect(keys('terrazzo')).not.toContain('rotation');
    for (const kind of PATTERN_KINDS) {
      expect(keys(kind)).toContain('scale');
      expect(keys(kind)).toContain('thickness');
      expect(keys(kind)).not.toContain('softness');
      expect(keys(kind)).not.toContain('angle');
    }
  });

  it('changer de style repart des réglages du style, en gardant couleurs, graine et grain', () => {
    const custom: GeneratorParams = { ...DEFAULT_GENERATOR, seed: 99, grain: 0.7, colors: ['#111111', '#222222', '#333333'], scale: 0.9, thickness: 0.1, rotation: 40 };
    const dots = applyStyle(custom, 'dots');
    expect(dots).toMatchObject({ style: 'dots', seed: 99, grain: 0.7, colors: ['#111111', '#222222', '#333333'] });
    expect(dots.scale).toBe(styleSettings('dots').scale);
    expect(dots.rotation).toBe(styleSettings('dots').rotation);
    expect(applyStyle(dots, 'mesh')).toMatchObject({ style: 'mesh', softness: 0.5, points: 5 });
    expect(applyStyle(applyStyle(dots, 'stripes'), 'dots')).toEqual(dots);
  });

  it('des paramètres sans réglages de motif (anciens fonds épurés) restent valides', () => {
    const legacy: GeneratorParams = { style: 'linear', colors: ['#34373d', '#24262b', '#17181b'], angle: 180, grain: 0.06, seed: 1 };
    expect(resolveSettings(legacy)).toEqual(styleSettings('linear'));
    expect(resolveSettings({ ...legacy, style: 'mesh', points: 99, softness: 0.2 })).toMatchObject({ points: 6, softness: 0.2 });
    expect(resolveSettings({ ...legacy, style: 'wavy', rotation: 15 }).rotation).toBe(15);
    expect(resolveSettings({ ...legacy, style: 'wavy' }).rotation).toBe(styleSettings('wavy').rotation);
    expect(isPatternStyle('wavy')).toBe(true);
    expect(isPatternStyle('mesh')).toBe(false);
  });

  it('« Varier » : une graine suivante reproductible, jamais la même', () => {
    expect(nextSeed(7)).toBe(nextSeed(7));
    expect(nextSeed(7)).not.toBe(7);
    const seen = new Set<number>();
    let seed = 1;
    for (let i = 0; i < 200; i++) {
      seed = nextSeed(seed);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      seen.add(seed);
    }
    expect(seen.size).toBeGreaterThan(195);
  });

  it('palette de six couleurs : rôles d’accent Material You, sinon dérivés des trois couleurs', () => {
    const scheme = schemeFromSeed('#6750A4', false);
    const accents = schemeAccents(scheme);
    expect(accents).toEqual([scheme.primary, scheme.secondary, scheme.tertiary]);
    expect(paletteOf({ colors: schemePalette(scheme), accents })).toEqual([...schemePalette(scheme), ...accents]);
    const derived = paletteOf({ colors: CURATED_PALETTES[0]! });
    expect(derived).toHaveLength(6);
    expect(derived.slice(0, 3)).toEqual(CURATED_PALETTES[0]);
    // Un tirage au hasard efface les teintes d'appoint de la palette précédente.
    expect(Object.hasOwn(randomize(3), 'accents')).toBe(true);
    expect(randomize(3).accents).toBeUndefined();
  });
});

describe('rendu de chaque style', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Contexte 2D factice : enregistre les appels, accepte toute propriété. */
  function fakeContext() {
    const calls: string[] = [];
    const ctx: unknown = new Proxy(
      {},
      {
        get: (_, prop: string) => {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
          return (...args: unknown[]) => {
            calls.push(prop);
            return args[0];
          };
        },
        set: () => true,
      },
    );
    return { ctx: ctx as CanvasRenderingContext2D, calls };
  }

  it('tous les styles se dessinent, sans toucher à autre chose qu’au canevas fourni', () => {
    const scratch = { width: 0, height: 0, getContext: () => fakeContext().ctx };
    vi.stubGlobal('document', { createElement: () => scratch });
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    for (const { value } of STYLES) {
      const { ctx, calls } = fakeContext();
      renderGenerated(ctx, { ...DEFAULT_GENERATOR, style: value, grain: 0, ...styleSettings(value) }, 100, 220);
      expect(calls[0], value).toBe('save');
      expect(calls.at(-1), value).toBe('restore');
      expect(calls.length, value).toBeGreaterThanOrEqual(4);
    }
  });
});
