import { describe, expect, it } from 'vitest';
import { PROVERBS } from './proverbs';
import { dayKey, dayNumber, dayNumberOf, passOrder, pickIndex } from './selection';

// Les mêmes valeurs sont vérifiées côté natif (QuoteSelectorTest.kt) : l'app et le fond d'écran
// doivent toujours afficher la même phrase.
describe('numéro du jour', () => {
  it('compte les jours depuis le 1er janvier 1970', () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(dayNumber(1969, 12, 31)).toBe(-1);
    expect(dayNumber(2000, 3, 1)).toBe(11017);
    expect(dayNumber(2024, 2, 29)).toBe(19782);
    expect(dayNumber(2026, 10, 2)).toBe(20728);
    expect(dayNumber(2026, 12, 31)).toBe(20818);
    expect(dayNumber(2027, 1, 1)).toBe(20819);
  });

  it('avance d’un par jour, années bissextiles comprises', () => {
    expect(dayNumber(2024, 3, 1) - dayNumber(2024, 2, 28)).toBe(2);
    expect(dayNumber(2025, 3, 1) - dayNumber(2025, 2, 28)).toBe(1);
    expect(dayNumber(2100, 3, 1) - dayNumber(2100, 2, 28)).toBe(1);
    expect(dayNumber(2000, 3, 1) - dayNumber(2000, 2, 28)).toBe(2);
  });

  it('suit le calendrier local de la date', () => {
    const evening = new Date(2026, 9, 2, 23, 59, 59);
    const morning = new Date(2026, 9, 3, 0, 0, 1);
    expect(dayNumberOf(evening)).toBe(20728);
    expect(dayNumberOf(morning)).toBe(20729);
    expect(dayKey(evening)).toBe('2026-10-02');
    expect(dayKey(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});

describe('ordre de passage', () => {
  it('mélange de façon stable, identique côté natif', () => {
    expect(passOrder(0)).toEqual([]);
    expect(passOrder(1)).toEqual([0]);
    expect(passOrder(2)).toEqual([0, 1]);
    expect(passOrder(3)).toEqual([1, 2, 0]);
    expect(passOrder(7)).toEqual([1, 3, 4, 5, 2, 0, 6]);
    expect(passOrder(10)).toEqual([0, 8, 9, 5, 3, 4, 6, 2, 1, 7]);
    expect(passOrder(100).slice(0, 12)).toEqual([82, 48, 89, 73, 58, 0, 33, 14, 11, 75, 52, 96]);
  });

  it('contient chaque phrase une seule fois', () => {
    for (const count of [1, 2, 3, 5, 57, 108, 137, 500]) {
      expect([...passOrder(count)].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    }
  });
});

describe('phrase du jour', () => {
  const today = dayNumber(2026, 10, 2);

  it('suit l’ordre de passage, valeurs identiques côté natif', () => {
    const picks = (count: number) => [0, 1, 2, 3, 4, 5].map((shift) => pickIndex(today, shift, count));
    expect(picks(3)).toEqual([2, 0, 1, 2, 0, 1]);
    expect(picks(10)).toEqual([1, 7, 0, 8, 9, 5]);
    expect(picks(100)).toEqual([95, 68, 31, 88, 77, 29]);
    expect(picks(137)).toEqual([85, 127, 82, 112, 36, 94]);
  });

  it('ne répète rien avant d’avoir parcouru toute la liste', () => {
    for (const count of [2, 3, 4, 10, 57, PROVERBS.length, 137]) {
      for (let start = 0; start < count * 3; start += 7) {
        const seen = new Set<number>();
        for (let i = 0; i < count; i++) seen.add(pickIndex(today + start + i, 0, count));
        expect(seen.size).toBe(count);
      }
    }
  });

  it('ne donne jamais la même phrase deux jours de suite (dès deux phrases)', () => {
    for (const count of [2, 3, 5, PROVERBS.length]) {
      for (let i = 0; i < count * 4; i++) expect(pickIndex(today + i, 0, count)).not.toBe(pickIndex(today + i + 1, 0, count));
    }
  });

  it('« Une autre » passe à la suivante, et demain ne la répète pas', () => {
    const count = PROVERBS.length;
    const order = passOrder(count);
    const position = today % count;
    expect(pickIndex(today, 0, count)).toBe(order[position]);
    expect(pickIndex(today, 1, count)).toBe(order[(position + 1) % count]);
    // Demain, avec le cran déjà pris : on repart de la phrase d’après, pas de celle qu'on vient de voir.
    expect(pickIndex(today + 1, 1, count)).toBe(order[(position + 2) % count]);
    expect(pickIndex(today + 1, 1, count)).not.toBe(pickIndex(today, 1, count));
  });

  it('gère une liste vide, un cran négatif ou fractionnaire', () => {
    expect(pickIndex(today, 0, 0)).toBe(-1);
    expect(pickIndex(today, 3, -2)).toBe(-1);
    expect(pickIndex(today, -4, 10)).toBe(pickIndex(today, 0, 10));
    expect(pickIndex(today, 2.9, 10)).toBe(pickIndex(today, 2, 10));
    expect(pickIndex(today, 0, 1)).toBe(0);
  });
});
