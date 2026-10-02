import { describe, expect, it } from 'vitest';
import {
  completePalette,
  hexToOklab,
  lightness,
  makeRamp,
  mixHex,
  oklabToHex,
  parseHex,
  shiftLightness,
  spreadLightness,
  toHex,
} from './color';
import { cellRandom, mulberry32, shuffled } from './random';

const channelGap = (a: string, b: string) => Math.max(...parseHex(a).map((v, i) => Math.abs(v - (parseHex(b)[i] as number))));

describe('couleurs du générateur', () => {
  it('lit et écrit l’hexadécimal, y compris les formes courtes et invalides', () => {
    expect(parseHex('#6750A4')).toEqual([103, 80, 164]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('pas une couleur')).toEqual([0, 0, 0]);
    expect(toHex([103, 80, 164])).toBe('#6750a4');
    expect(toHex([-20, 300, 127.6])).toBe('#00ff80');
  });

  it('OKLab : aller-retour fidèle et clarté perceptuelle ordonnée', () => {
    for (const hex of ['#000000', '#ffffff', '#6750a4', '#ffd8e4', '#0f2027', '#fda085', '#96e6a1', '#808080']) {
      expect(channelGap(oklabToHex(hexToOklab(hex)), hex)).toBeLessThanOrEqual(1);
    }
    expect(lightness('#000000')).toBeCloseTo(0, 5);
    expect(lightness('#ffffff')).toBeCloseTo(1, 3);
    expect(lightness('#ffd8e4')).toBeGreaterThan(lightness('#6750a4'));
    const [, a, b] = hexToOklab('#9e9e9e');
    expect(Math.hypot(a, b)).toBeLessThan(0.01);
  });

  it('mélange perceptuel : extrémités, constance et clarté intermédiaire', () => {
    expect(mixHex('#6750a4', '#ffd8e4', 0)).toBe('#6750a4');
    expect(channelGap(mixHex('#6750a4', '#ffd8e4', 1), '#ffd8e4')).toBeLessThanOrEqual(1);
    expect(channelGap(mixHex('#336699', '#336699', 0.37), '#336699')).toBeLessThanOrEqual(1);
    const mid = lightness(mixHex('#000000', '#ffffff', 0.5));
    expect(mid).toBeGreaterThan(0.45);
    expect(mid).toBeLessThan(0.55);
  });

  it('éclaircit ou assombrit en gardant la teinte, sans sortir de [0, 1]', () => {
    const base = '#8ec5fc';
    expect(lightness(shiftLightness(base, 0.1))).toBeGreaterThan(lightness(base));
    expect(lightness(shiftLightness(base, -0.2))).toBeLessThan(lightness(base) - 0.15);
    expect(shiftLightness(base, -5)).toBe('#000000');
    expect(shiftLightness(base, 5)).toBe('#ffffff');
  });

  it('étale les clartés : tri décroissant et écart minimal respecté', () => {
    const spread = spreadLightness(['#ffd8e4', '#fcd6e2', '#e9ddff'], 0.06);
    const lights = spread.map(lightness);
    expect(lights[0]).toBeGreaterThan(lights[1] as number);
    expect(lights[1]).toBeGreaterThan(lights[2] as number);
    expect((lights[0] as number) - (lights[1] as number)).toBeGreaterThanOrEqual(0.059);
    expect((lights[1] as number) - (lights[2] as number)).toBeGreaterThanOrEqual(0.059);
    // Des clartés déjà bien écartées ne bougent pas.
    expect(spreadLightness(['#202020', '#ffffff', '#808080'], 0.1)).toEqual(['#ffffff', '#808080', '#202020']);
  });

  it('dégradé multi-étapes', () => {
    const ramp = makeRamp(['#000000', '#ff0000', '#ffffff']);
    expect(ramp(0)).toBe('#000000');
    expect(ramp(1)).toBe('#ffffff');
    expect(channelGap(ramp(0.5), '#ff0000')).toBeLessThanOrEqual(1);
    expect(ramp(-3)).toBe('#000000');
    expect(makeRamp(['#123456'])(0.4)).toBe('#123456');
  });

  it('palette complète : trois couleurs de base, trois teintes d’appoint', () => {
    const base = ['#e9ddff', '#ffd8e4', '#313033'];
    const derived = completePalette(base);
    expect(derived).toHaveLength(6);
    expect(derived.slice(0, 3)).toEqual(base);
    // Les teintes dérivées vont de l'accent doux vers la couleur de contraste : elles tranchent sur le fond.
    for (const accent of derived.slice(3)) {
      expect(lightness(accent)).toBeLessThan(lightness(base[1] as string));
      expect(lightness(accent)).toBeGreaterThan(lightness(base[2] as string) - 0.001);
    }
    const given = completePalette(base, ['#6750a4', '#625b71', '#7d5260']);
    expect(given.slice(3)).toEqual(['#6750a4', '#625b71', '#7d5260']);
    // Une palette incomplète est complétée sans erreur.
    expect(completePalette(['#123456'])).toHaveLength(6);
    expect(completePalette([])).toHaveLength(6);
  });
});

describe('aléatoire reproductible', () => {
  it('une valeur de cellule ne dépend que de (graine, i, j, sel)', () => {
    expect(cellRandom(7, 3, -2, 1)).toBe(cellRandom(7, 3, -2, 1));
    expect(cellRandom(7, 3, -2, 1)).not.toBe(cellRandom(8, 3, -2, 1));
    expect(cellRandom(7, 3, -2, 1)).not.toBe(cellRandom(7, 3, -2, 2));
    expect(cellRandom(7, 3, -2)).not.toBe(cellRandom(7, -2, 3));
  });

  it('valeurs dans [0, 1[, bien réparties et sans corrélation entre voisines', () => {
    const values: number[] = [];
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) values.push(cellRandom(42, i, j, 5));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    const quarters = [0, 0, 0, 0];
    for (const v of values) quarters[Math.floor(v * 4)]!++;
    for (const q of quarters) expect(Math.abs(q / values.length - 0.25)).toBeLessThan(0.03);
    // Corrélation de chaque cellule avec sa voisine de droite.
    let cov = 0;
    let n = 0;
    for (let i = 0; i < 59; i++) {
      for (let j = 0; j < 60; j++) {
        cov += (cellRandom(42, i, j, 5) - mean) * (cellRandom(42, i + 1, j, 5) - mean);
        n++;
      }
    }
    expect(Math.abs(cov / n / (1 / 12))).toBeLessThan(0.06);
  });

  it('mélange reproductible qui conserve les éléments', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffled(items, mulberry32(3));
    expect(a).toEqual(shuffled(items, mulberry32(3)));
    expect([...a].sort()).toEqual(items);
    expect(shuffled(items, mulberry32(4))).not.toEqual(a);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
