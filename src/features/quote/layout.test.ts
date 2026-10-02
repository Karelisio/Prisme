import { describe, expect, it } from 'vitest';
import {
  type QuoteStyle,
  averageLuma,
  balancedLines,
  ellipsize,
  fontSpec,
  planQuote,
  sampleBox,
  samplePoints,
  shadowOf,
  toneFor,
  typeset,
  veilAlpha,
  veilBand,
  wrapLines,
} from './layout';

// Les mêmes valeurs sont vérifiées côté natif (QuoteLayoutTest.kt) : l'aperçu de l'app et le fond
// d'écran doivent se dessiner de la même façon.
const measure = (s: string, size: number, role: 'text' | 'author') => s.length * size * (role === 'author' ? 0.45 : 0.5);
const style: QuoteStyle = { font: 'serif', position: 'bottom', size: 'medium', color: 'auto' };

describe('typographie', () => {
  it('simplifie les espaces, courbe les apostrophes, protège la ponctuation', () => {
    expect(typeset("  Salut   ...  « Ça va ? »  l'ami ; ok :  oui !  ")).toBe('Salut … «\xA0Ça va\xA0?\xA0» l’ami\xA0; ok\xA0: oui\xA0!');
    expect(typeset('\n\t')).toBe('');
    expect(typeset('un\xA0\u{202F}deux')).toBe('un deux');
  });
});

describe('retours à la ligne', () => {
  const chars = (s: string) => s.length;
  const text = 'un deux trois quatre cinq six sept huit neuf dix';

  it('coupe au mot près', () => {
    expect(wrapLines(text, 20, chars)).toEqual(['un deux trois quatre', 'cinq six sept huit', 'neuf dix']);
    expect(wrapLines('', 20, chars)).toEqual([]);
    expect(wrapLines('court', 20, chars)).toEqual(['court']);
  });

  it('équilibre les lignes sans en ajouter', () => {
    expect(balancedLines(text, 20, chars)).toEqual(['un deux trois', 'quatre cinq six', 'sept huit neuf dix']);
    expect(balancedLines('court', 20, chars)).toEqual(['court']);
  });

  it('coupe un mot plus large que la ligne', () => {
    expect(wrapLines('abcdefghij kl', 4, chars)).toEqual(['abcd', 'efgh', 'ij', 'kl']);
  });

  it('abrège avec des points de suspension', () => {
    expect(ellipsize('bonjour tout le monde', 10, chars, false)).toBe('bonjour t…');
    expect(ellipsize('court', 10, chars, false)).toBe('court');
    expect(ellipsize('court', 10, chars, true)).toBe('court…');
  });
});

describe('plan de la phrase', () => {
  const near = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i] as number, 3));
  };

  it('phrase courte au verrouillage, en bas', () => {
    const p = planQuote({ text: "Petit à petit, l'oiseau fait son nid." }, style, 'lock', 1080, 2400, measure);
    expect(p.lines).toEqual(['Petit à petit,', 'l’oiseau fait son nid.']);
    expect(p.fontSize).toBeCloseTo(66.96, 3);
    expect(p.lineHeight).toBeCloseTo(87.048, 3);
    expect(p.author).toBeNull();
    expect(p.centerX).toBe(540);
    expect(p.maxWidth).toBeCloseTo(864, 3);
    expect(p.top).toBeCloseTo(1745.904, 3);
    expect(p.height).toBeCloseTo(174.096, 3);
    expect(p.top + p.height).toBeCloseTo(0.8 * 2400, 3);
    near(p.baselines, [1812.864, 1899.912]);
    expect(p.truncated).toBe(false);
  });

  it('en haut du verrouillage, sous l’horloge, avec un auteur', () => {
    const p = planQuote(
      { text: 'Il faut tourner sept fois sa langue dans sa bouche avant de parler.', author: 'Proverbe' },
      { ...style, position: 'top', size: 'large' },
      'lock',
      1080,
      2400,
      measure,
    );
    expect(p.lines).toEqual(['Il faut tourner', 'sept fois sa langue', 'dans sa bouche', 'avant de parler.']);
    expect(p.fontSize).toBeCloseTo(82.08, 3);
    expect(p.author).toBe('— Proverbe');
    expect(p.authorSize).toBeCloseTo(49.248, 3);
    expect(p.top).toBeCloseTo(816, 3);
    expect(p.height).toBeCloseTo(531.8784, 3);
    near(p.baselines, [898.08, 1004.784, 1111.488, 1218.192]);
    expect(p.authorBaseline).toBeCloseTo(1333.104, 3);
  });

  it('texte trop long : rétréci puis coupé, au centre de l’accueil', () => {
    const p = planQuote(
      { text: `${'Un texte vraiment très long '.repeat(12)}fin ; vraiment !`, author: 'Moi' },
      { ...style, position: 'center', size: 'large' },
      'home',
      1080,
      2400,
      measure,
    );
    expect(p.fontSize).toBeCloseTo(50.8896, 3);
    expect(p.lines).toHaveLength(11);
    expect(p.lines[10]).toBe('Un texte vraiment très long…');
    expect(p.truncated).toBe(true);
    expect(p.top).toBeCloseTo(803.570016, 3);
    expect(p.height).toBeCloseTo(792.859968, 3);
    // Le bloc reste dans sa hauteur maximale.
    expect(p.height).toBeLessThanOrEqual(2400 * 0.34);
    expect(p.authorBaseline).toBeCloseTo(1587.269856, 3);
  });

  it('mot plus large que la ligne : coupé au caractère', () => {
    const p = planQuote({ text: `Anticonstitutionnellement ${'x'.repeat(80)}` }, { ...style, position: 'top', size: 'small' }, 'home', 540, 1200, measure);
    expect(p.fontSize).toBeCloseTo(27, 3);
    expect(p.lines).toHaveLength(4);
    expect(p.lines.every((line) => line.length * 27 * 0.5 <= p.maxWidth)).toBe(true);
    expect(p.top).toBeCloseTo(120, 3);
  });

  it('un mot, en bas d’un petit écran d’accueil', () => {
    const p = planQuote({ text: 'Bonjour' }, { ...style, size: 'small' }, 'home', 720, 1280, measure);
    expect(p.lines).toEqual(['Bonjour']);
    expect(p.fontSize).toBeCloseTo(36, 3);
    expect(p.top).toBeCloseTo(977.2, 3);
    expect(p.baselines[0]).toBeCloseTo(1013.2, 3);
  });

  it('reste dans l’écran, sans masquer l’horloge du verrouillage', () => {
    const texts = ['Court.', 'Une phrase un peu plus longue qui passera sur deux ou trois lignes.', 'mot '.repeat(60)];
    for (const [w, h] of [[1080, 2400], [720, 1280], [1440, 3200], [480, 800]] as const) {
      for (const text of texts) {
        for (const position of ['top', 'center', 'bottom'] as const) {
          for (const screen of ['home', 'lock'] as const) {
            const p = planQuote({ text, author: 'Auteur' }, { ...style, position, size: 'large' }, screen, w, h, measure);
            const label = `${w}x${h} ${screen} ${position}`;
            expect(p.top, label).toBeGreaterThanOrEqual(h * 0.06 - 1e-6);
            expect(p.top + p.height, label).toBeLessThanOrEqual(h * 0.94 + 1e-6);
            expect(p.height, label).toBeLessThanOrEqual(h * 0.34 + 1e-6);
            if (screen === 'lock' && position === 'top') expect(p.top, label).toBeGreaterThanOrEqual(h * 0.34 - 1e-6);
          }
        }
      }
    }
  });

  it('mesure une grille de points au centre des cases', () => {
    expect(samplePoints({ left: 108, top: 1745, right: 972, bottom: 1920 }, 2)).toEqual([
      { x: 324, y: 1788 },
      { x: 756, y: 1788 },
      { x: 324, y: 1876 },
      { x: 756, y: 1876 },
    ]);
    // Une zone étroite répète ses pixels sans en sortir.
    expect(samplePoints({ left: 0, top: 0, right: 3, bottom: 2 }, 4).map((p) => `${p.x},${p.y}`)).toEqual([
      '0,0', '1,0', '1,0', '2,0', '0,0', '1,0', '1,0', '2,0', '0,1', '1,1', '1,1', '2,1', '0,1', '1,1', '1,1', '2,1',
    ]);
    expect(samplePoints({ left: 5, top: 5, right: 5, bottom: 9 })).toEqual([]);
    expect(samplePoints({ left: 0, top: 0, right: 100, bottom: 100 })).toHaveLength(24 * 24);
  });

  it('zone mesurée et voile', () => {
    const p = planQuote({ text: "Petit à petit, l'oiseau fait son nid." }, style, 'lock', 1080, 2400, measure);
    expect(sampleBox(p, 1080, 2400)).toEqual({ left: 108, top: 1745, right: 972, bottom: 1920 });
    const band = veilBand(p, 2400);
    expect(band.top).toBeCloseTo(1665.552, 3);
    expect(band.bottom).toBeCloseTo(2000.352, 3);
    expect(veilBand({ ...p, top: 10 }, 2400).top).toBe(0);
  });
});

describe('couleur et lisibilité', () => {
  it('mesure la luminosité moyenne', () => {
    expect(averageLuma([255, 255, 255, 255, 0, 0, 0, 255])).toBeCloseTo(0.5, 6);
    expect(averageLuma([10, 20, 30, 255])).toBeCloseTo(0.072925, 6);
    expect(averageLuma([200, 100, 50, 255, 20, 40, 60, 255, 255, 0, 0, 255])).toBeCloseTo(0.273275, 6);
    expect(averageLuma([])).toBe(0);
  });

  it('texte clair sur fond sombre, sombre sur fond clair, ou couleur imposée', () => {
    expect(toneFor('auto', 0.1)).toBe('light');
    expect(toneFor('auto', 0.58)).toBe('light');
    expect(toneFor('auto', 0.59)).toBe('dark');
    expect(toneFor('white', 1)).toBe('light');
    expect(toneFor('black', 0)).toBe('dark');
  });

  it('voile plus fort quand le fond contredit le texte', () => {
    expect(veilAlpha('light', 0.1)).toBeCloseTo(0.14, 6);
    expect(veilAlpha('light', 0.5)).toBeCloseTo(0.253333, 6);
    expect(veilAlpha('light', 1)).toBeCloseTo(0.48, 6);
    expect(veilAlpha('dark', 0.9)).toBeCloseTo(0.14, 6);
    expect(veilAlpha('dark', 0.58)).toBeCloseTo(0.192889, 6);
    expect(veilAlpha('dark', 0.2)).toBeCloseTo(0.48, 6);
  });

  it('ombre douce de la couleur opposée', () => {
    expect(shadowOf('light', 67)).toEqual({ alpha: 0.55, blur: 6.7, dy: 2.345 });
    expect(shadowOf('dark', 67).alpha).toBe(0.45);
    expect(shadowOf('dark', 67).dy).toBe(0);
  });

  it('polices du canevas', () => {
    expect(fontSpec('serif', 'text', 66.964)).toBe('italic 400 66.96px "Noto Serif", Georgia, serif');
    expect(fontSpec('sans', 'author', 40)).toBe('500 40px Roboto, system-ui, sans-serif');
  });
});
