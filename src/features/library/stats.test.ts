import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import type { WallpaperTarget } from '@/shared/native';
import type { HistoryEntry } from './model';
import { computeStats, formatDuration, longestShown, mergedLength } from './stats';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const wp = (id: string, source: Wallpaper['source'] = 'unsplash'): Wallpaper => ({
  id,
  source,
  width: 1080,
  height: 2400,
  color: '#204080',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

const items = Object.fromEntries([wp('a'), wp('b'), wp('c', 'pexels'), wp('d', 'wallhaven')].map((w) => [w.id, w]));
const h = (wallpaperId: string, target: WallpaperTarget, at: number, auto = false): HistoryEntry => ({
  id: `${wallpaperId}-${target}-${at}`,
  wallpaperId,
  target,
  at,
  ...(auto && { auto: true }),
});

describe('statistiques', () => {
  const now = 10 * DAY;

  it('additionne des intervalles sans compter deux fois les chevauchements', () => {
    expect(mergedLength([])).toBe(0);
    expect(
      mergedLength([
        [0, 10],
        [5, 20],
        [30, 40],
      ]),
    ).toBe(30);
    expect(
      mergedLength([
        [30, 40],
        [0, 100],
      ]),
    ).toBe(100);
  });

  it('historique vide : rien à compter', () => {
    expect(computeStats([], items, now)).toEqual({ total: 0, auto: 0, since: null, usage: [], bySource: [] });
  });

  it('compte les applications et le temps entre deux applications sur le même écran', () => {
    const history = [
      h('a', 'both', 0), // a : 2 jours sur les deux écrans, puis…
      h('b', 'both', 2 * DAY), // b : 1 jour, puis…
      h('a', 'both', 3 * DAY, true), // a de nouveau jusqu'à maintenant (7 jours)
    ];
    const stats = computeStats(history, items, now);
    const a = stats.usage.find((u) => u.id === 'a');
    const b = stats.usage.find((u) => u.id === 'b');
    expect(a).toEqual({ id: 'a', count: 2, ms: 2 * DAY + 7 * DAY, lastAt: 3 * DAY });
    expect(b).toEqual({ id: 'b', count: 1, ms: DAY, lastAt: 2 * DAY });
    expect(stats.total).toBe(3);
    expect(stats.auto).toBe(1);
    expect(stats.since).toBe(0);
    // Du plus appliqué au moins appliqué.
    expect(stats.usage.map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('suit chaque écran séparément, et un fond sur les deux écrans ne compte qu’une fois', () => {
    const history = [
      h('a', 'home', 0), // accueil : a jusqu'à c (1 jour)
      h('b', 'lock', 0), // verrouillage : b jusqu'à a (2 jours)
      h('c', 'home', DAY), // accueil : c jusqu'à maintenant (9 jours)
      h('a', 'lock', 2 * DAY), // verrouillage : a jusqu'à maintenant (8 jours)
    ];
    const stats = computeStats(history, items, now);
    const ms = Object.fromEntries(stats.usage.map((u) => [u.id, u.ms]));
    expect(ms).toEqual({ a: DAY + 8 * DAY, b: 2 * DAY, c: 9 * DAY });

    // a est à l'accueil le 1er jour puis au verrouillage du jour 2 à aujourd'hui : intervalles disjoints.
    // Appliqué sur « les deux » pendant que l'autre écran le montre déjà, il ne compte qu'une fois :
    const overlap = computeStats([h('a', 'home', 0), h('a', 'both', DAY), h('b', 'both', 3 * DAY)], items, now);
    expect(overlap.usage.find((u) => u.id === 'a')?.ms).toBe(3 * DAY);
  });

  it('un fond appliqué deux fois de suite sur le même écran compte deux applications', () => {
    const stats = computeStats([h('a', 'both', 0), h('a', 'both', DAY)], items, 2 * DAY);
    expect(stats.usage).toEqual([{ id: 'a', count: 2, ms: 2 * DAY, lastAt: DAY }]);
  });

  it('ignore les applications dans le futur et ne dépend pas de l’ordre de l’historique', () => {
    const history = [h('b', 'both', 5 * DAY), h('a', 'both', 0)];
    const stats = computeStats(history, items, 3 * DAY);
    expect(stats.usage.find((u) => u.id === 'a')?.ms).toBe(3 * DAY);
    expect(stats.usage.find((u) => u.id === 'b')?.ms).toBe(0);
  });

  it('départage les égalités par le temps affiché puis la date', () => {
    const history = [h('a', 'both', 0), h('b', 'both', DAY), h('c', 'both', 4 * DAY)];
    const stats = computeStats(history, items, 5 * DAY);
    // Une application chacun : c'est la durée (a 1 j, b 3 j, c 1 j) puis la date qui décident.
    expect(stats.usage.map((u) => u.id)).toEqual(['b', 'c', 'a']);
  });

  it('répartit les applications et le temps par source', () => {
    const history = [h('a', 'both', 0), h('b', 'both', DAY), h('c', 'both', 2 * DAY), h('a', 'both', 3 * DAY), h('d', 'both', 4 * DAY)];
    const stats = computeStats(history, items, 5 * DAY);
    expect(stats.bySource).toEqual([
      { source: 'unsplash', count: 3, ms: DAY * 3 },
      { source: 'pexels', count: 1, ms: DAY },
      { source: 'wallhaven', count: 1, ms: DAY },
    ]);
  });

  it('les fonds inconnus du catalogue comptent dans le classement mais pas par source', () => {
    const stats = computeStats([h('zzz', 'both', 0)], items, DAY);
    expect(stats.usage).toHaveLength(1);
    expect(stats.bySource).toEqual([]);
  });

  it('classe les fonds par temps passé', () => {
    const history = [h('a', 'both', 0), h('b', 'both', DAY), h('c', 'both', 4 * DAY), h('d', 'both', 4 * DAY + MIN)];
    const stats = computeStats(history, items, 4 * DAY + 2 * MIN);
    expect(longestShown(stats, 2).map((u) => u.id)).toEqual(['b', 'a']);
    expect(longestShown(stats, 10).every((u) => u.ms > 0)).toBe(true);
  });

  it('écrit les durées en français', () => {
    expect(formatDuration(20_000)).toBe('moins d’une minute');
    expect(formatDuration(12 * MIN)).toBe('12 min');
    expect(formatDuration(2 * HOUR)).toBe('2 h');
    expect(formatDuration(5 * HOUR + 20 * MIN)).toBe('5 h 20 min');
    expect(formatDuration(3 * DAY)).toBe('3 j');
    expect(formatDuration(3 * DAY + 4 * HOUR + 30 * MIN)).toBe('3 j 4 h');
  });
});
