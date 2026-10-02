import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUOTE_PREFS,
  MAX_CUSTOM_QUOTES,
  MAX_QUOTE_AUTHOR,
  MAX_QUOTE_TEXT,
  type QuotePrefs,
  activeQuotes,
  buildQuoteConfig,
  cleanQuote,
  insertQuote,
  mergeCustomQuotes,
  quoteOfTheDay,
  quoteStatusKind,
} from './model';
import { PROVERBS } from './proverbs';
import { dayNumber, passOrder } from './selection';

const mine = [
  { id: 'a', text: 'Carpe diem', author: 'Moi' },
  { id: 'b', text: '  Ce qui compte,   c’est le chemin.  ' },
  { id: 'c', text: '   ' },
];

describe('proverbes intégrés', () => {
  it('sont une centaine, courts, uniques, sans guillemets droits', () => {
    expect(PROVERBS.length).toBeGreaterThanOrEqual(80);
    expect(PROVERBS.length).toBeLessThanOrEqual(120);
    expect(new Set(PROVERBS).size).toBe(PROVERBS.length);
    for (const proverb of PROVERBS) {
      expect(proverb.length).toBeLessThanOrEqual(80);
      expect(proverb).not.toContain("'");
      expect(proverb).toBe(proverb.trim());
    }
  });
});

describe('citations perso', () => {
  it('nettoie et borne le texte et l’auteur', () => {
    expect(cleanQuote('  Petit   à petit  ', '  Moi ')).toEqual({ text: 'Petit à petit', author: 'Moi' });
    expect(cleanQuote('Texte', '   ')).toEqual({ text: 'Texte' });
    expect(cleanQuote('Texte')).toEqual({ text: 'Texte' });
    expect(cleanQuote('   ', 'Moi')).toBeNull();
    expect(cleanQuote('x'.repeat(500), 'y'.repeat(500))).toEqual({ text: 'x'.repeat(MAX_QUOTE_TEXT), author: 'y'.repeat(MAX_QUOTE_AUTHOR) });
  });

  it('retrouve la place d’une citation supprimée, une seule fois', () => {
    const list = [{ id: 'a', text: 'A' }, { id: 'c', text: 'C' }];
    const b = { id: 'b', text: 'B' };
    expect(insertQuote(list, b, 1).map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(insertQuote(list, b, 99).map((q) => q.id)).toEqual(['a', 'c', 'b']);
    expect(insertQuote(list, b, -3).map((q) => q.id)).toEqual(['b', 'a', 'c']);
    expect(insertQuote(insertQuote(list, b, 1), b, 1)).toHaveLength(3);
  });

  it('fusionne une sauvegarde sans rien perdre ni dupliquer', () => {
    const current = [{ id: 'a', text: 'A', author: 'x' }];
    const incoming = [
      { id: 'a', text: 'A modifiée' },
      { id: 'z', text: 'A', author: 'x' },
      { id: 'n', text: 'Nouvelle' },
    ];
    const merged = mergeCustomQuotes(current, incoming);
    expect(merged.map((q) => q.id)).toEqual(['a', 'n']);
    expect(mergeCustomQuotes(merged, incoming)).toEqual(merged);
    const full = Array.from({ length: MAX_CUSTOM_QUOTES }, (_, i) => ({ id: `q${i}`, text: `t${i}` }));
    expect(mergeCustomQuotes(full, [{ id: 'extra', text: 'trop' }])).toHaveLength(MAX_CUSTOM_QUOTES);
  });
});

describe('liste active', () => {
  it('suit la source choisie', () => {
    expect(activeQuotes('proverbs', mine)).toHaveLength(PROVERBS.length);
    expect(activeQuotes('proverbs', mine)[0]).toEqual({ text: PROVERBS[0] });
    expect(activeQuotes('mine', mine)).toEqual([{ text: 'Carpe diem', author: 'Moi' }, { text: 'Ce qui compte, c’est le chemin.' }]);
    const both = activeQuotes('both', mine);
    expect(both).toHaveLength(PROVERBS.length + 2);
    expect(both.at(-1)).toEqual({ text: 'Ce qui compte, c’est le chemin.' });
  });

  it('retombe sur les proverbes sans citation perso', () => {
    expect(activeQuotes('mine', [])).toHaveLength(PROVERBS.length);
    expect(activeQuotes('mine', [mine[2] as (typeof mine)[number]])).toHaveLength(PROVERBS.length);
  });
});

describe('phrase du jour', () => {
  const list = activeQuotes('proverbs', []);
  const day = new Date(2026, 9, 2, 6, 0);

  it('est la même toute la journée, change le lendemain, avance avec « Une autre »', () => {
    const today = quoteOfTheDay(list, day, 0);
    expect(quoteOfTheDay(list, new Date(2026, 9, 2, 23, 59), 0)).toEqual(today);
    expect(quoteOfTheDay(list, new Date(2026, 9, 3, 6, 0), 0)).not.toEqual(today);
    const order = passOrder(list.length);
    const position = dayNumber(2026, 10, 2) % list.length;
    expect(today).toEqual(list[order[position] as number]);
    expect(quoteOfTheDay(list, day, 1)).toEqual(list[order[(position + 1) % list.length] as number]);
  });

  it('n’a rien à donner sans phrase', () => {
    expect(quoteOfTheDay([], day, 0)).toBeNull();
  });
});

describe('réglages envoyés au natif', () => {
  const prefs: QuotePrefs = { ...DEFAULT_QUOTE_PREFS, target: 'both', source: 'both', font: 'sans', position: 'top', size: 'large', color: 'white', shift: 3.7, custom: mine };

  it('portent les choix et la liste active', () => {
    const config = buildQuoteConfig(true, prefs);
    expect(config).toMatchObject({ enabled: true, target: 'both', font: 'sans', position: 'top', size: 'large', color: 'white', shift: 3 });
    expect(config.quotes).toEqual(activeQuotes('both', mine));
  });

  it('par défaut : verrouillage, proverbes, serif, en bas, taille moyenne, couleur automatique', () => {
    expect(buildQuoteConfig(true, DEFAULT_QUOTE_PREFS)).toMatchObject({
      enabled: true,
      target: 'lock',
      font: 'serif',
      position: 'bottom',
      size: 'medium',
      color: 'auto',
      shift: 0,
    });
  });

  it('option coupée : plus de phrases à envoyer', () => {
    expect(buildQuoteConfig(false, prefs)).toMatchObject({ enabled: false, quotes: [] });
  });
});

describe('état annoncé par l’écran', () => {
  const status = (home: boolean, lock: boolean, homeLive = false, lockLive = false) => ({ home, lock, homeLive, lockLive });

  it('option coupée, aucun fond posé par Prisme, un seul écran prêt, tout prêt', () => {
    expect(quoteStatusKind(status(true, true), false, 'lock')).toBe('off');
    expect(quoteStatusKind(status(false, false), true, 'lock')).toBe('none');
    expect(quoteStatusKind(status(true, false), true, 'lock')).toBe('none');
    expect(quoteStatusKind(status(false, true), true, 'lock')).toBe('ready');
    expect(quoteStatusKind(status(true, false), true, 'home')).toBe('ready');
    expect(quoteStatusKind(status(true, false), true, 'both')).toBe('partial');
    expect(quoteStatusKind(status(true, true), true, 'both')).toBe('ready');
    expect(quoteStatusKind(status(false, false), true, 'both')).toBe('none');
  });

  it('un fond animé n’empêche la phrase que sur l’écran qu’il occupe', () => {
    // Accueil animé, verrouillage avec son image fixe : la phrase se pose au verrouillage.
    expect(quoteStatusKind(status(true, true, true, false), true, 'lock')).toBe('ready');
    expect(quoteStatusKind(status(true, true, true, false), true, 'home')).toBe('live');
    expect(quoteStatusKind(status(true, true, true, false), true, 'both')).toBe('partial');
    expect(quoteStatusKind(status(true, true, true, true), true, 'both')).toBe('live');
    expect(quoteStatusKind(status(false, true, false, true), true, 'lock')).toBe('live');
    // Sans fond posé par Prisme, le fond animé n’y change rien : on le dit d’abord.
    expect(quoteStatusKind(status(false, false, false, false), true, 'lock')).toBe('none');
  });
});
