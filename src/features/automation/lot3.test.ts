import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { HOLIDAYS, easterSunday, eventDates, nextDate } from './events';
import { DEFAULT_AUTOMATION, buildConfig } from './model';
import type { OnlineContext } from './online';
import { dayOfYear, formatMinutes, sunTimes } from './sun';

const wp = (id: string): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 1080,
  height: 2400,
  color: '#000',
  alt: id,
  thumb: `t/${id}`,
  preview: `p/${id}`,
  full: `https://images.unsplash.com/${id}`,
});
const library = { items: { a: wp('a'), b: wp('b') }, favorites: { a: 1 }, collections: [] };
const off = { rotation: false, dynamic: false, focus: false, events: false };
const ctx: OnlineContext = {
  sources: { unsplash: true, pexels: false, wallhaven: true, pixabay: false, art: false, nasa: false },
  keys: { unsplash: 'cle', pexels: '' },
  hidden: { hiddenIds: {}, hiddenAuthors: {}, hiddenWords: [] },
  favorites: [],
};

describe('soleil', () => {
  it('lever et coucher à Paris, comme le natif', () => {
    const summer = sunTimes(48.8566, 2.3522, 172, 120);
    expect(Math.abs((summer?.sunrise ?? 0) - (5 * 60 + 47))).toBeLessThanOrEqual(6);
    expect(Math.abs((summer?.sunset ?? 0) - (21 * 60 + 58))).toBeLessThanOrEqual(6);
    expect(sunTimes(69.65, 18.96, 355, 60)).toBeNull();
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
    expect(formatMinutes(-30)).toBe('23:30');
  });

  it('créneaux ancrés sur le soleil quand un lieu est choisi', () => {
    const place = { name: 'Paris', latitude: 48.8566, longitude: 2.3522 };
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, followSun: true, place, slots: { morning: 'a', night: 'b' } } };
    const time = buildConfig(prefs, { ...off, dynamic: true }, library).dynamic.time;
    expect(time?.sun).toEqual({ latitude: 48.8566, longitude: 2.3522 });
    expect(time?.slots.map((s) => [s.anchor, s.offset])).toEqual([
      ['sunrise', -30],
      ['sunset', 40],
    ]);
    // Sans lieu : heures fixes.
    const fixed = buildConfig({ ...prefs, dynamic: { ...prefs.dynamic, place: null } }, { ...off, dynamic: true }, library).dynamic.time;
    expect(fixed?.sun).toBeUndefined();
    expect(fixed?.slots[0]).toEqual({ start: '06:00', item: { id: 'a', uri: 'https://images.unsplash.com/a' } });
  });

  it('mode sombre : fond clair et fond sombre', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, mode: 'theme' as const, theme: { dark: 'b' } } };
    expect(buildConfig(prefs, { ...off, dynamic: true }, library).dynamic.theme).toEqual({ dark: { id: 'b', uri: 'https://images.unsplash.com/b' } });
  });
});

describe('fêtes et dates perso', () => {
  it('Pâques et dates de l’année suivante', () => {
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
    const easter = HOLIDAYS.find((h) => h.key === 'easter');
    expect(eventDates(easter!.days, new Date(2026, 9, 2))).toEqual(['2026-04-05', '2026-04-06', '2027-03-28', '2027-03-29']);
    expect(nextDate(['2026-10-31', '2027-10-31'], new Date(2026, 9, 2))?.getDate()).toBe(31);
    expect(nextDate(['2025-01-01'], new Date(2026, 9, 2))).toBeNull();
  });

  it('dates perso d’abord, fond choisi ou thème en ligne, fêtes désactivables', () => {
    const prefs = {
      ...DEFAULT_AUTOMATION,
      events: {
        target: 'lock' as const,
        holidays: { christmas: { enabled: true, wallpaperId: 'a' }, valentine: { enabled: false } },
        custom: [{ id: '1', name: 'Anniversaire', month: 3, day: 14, keyword: 'birthday cake' }],
      },
    };
    const events = buildConfig(prefs, { ...off, events: true }, library, ctx, new Date(2026, 9, 2)).events;
    expect(events?.enabled).toBe(true);
    expect(events?.target).toBe('lock');
    const ids = events?.items.map((e) => e.id) ?? [];
    expect(ids[0]).toBe('custom:1');
    expect(ids).not.toContain('valentine');
    expect(events?.items[0]).toMatchObject({ dates: ['2026-03-14', '2027-03-14'] });
    expect(events?.items[0]?.queries).toContainEqual({ provider: 'unsplash', query: 'birthday cake', auth: 'Client-ID cle' });
    expect(events?.items.find((e) => e.id === 'christmas')).toMatchObject({ item: { id: 'a' }, dates: ['2026-12-24', '2026-12-25', '2027-12-24', '2027-12-25'] });
    // Sans contexte en ligne, seules les fêtes avec un fond choisi restent.
    expect(buildConfig(prefs, { ...off, events: true }, library, undefined, new Date(2026, 9, 2)).events?.items.map((e) => e.id)).toEqual(['christmas']);
  });
});
