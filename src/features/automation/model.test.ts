import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { DEFAULT_AUTOMATION, FAVORITES_SOURCE, buildConfig, rotationItems } from './model';

const wp = (id: string, local = false): Wallpaper => ({
  id,
  source: local ? 'creation' : 'unsplash',
  width: 1080,
  height: 2400,
  color: '#000',
  alt: id,
  thumb: `t/${id}`,
  preview: `p/${id}`,
  full: local ? `/data/creations/${id}.jpg` : `https://images.unsplash.com/${id}?fm=jpg`,
});

const library = {
  items: { a: wp('a'), b: wp('b'), c: wp('c', true) },
  favorites: { a: 1, b: 2 },
  collections: [{ id: 'col', name: 'Nuit', createdAt: 0, itemIds: ['c', 'a', 'disparu'] }],
};

const off = { rotation: false, dynamic: false, focus: false };

describe('configuration des automatismes', () => {
  it('tout est coupé tant que les options sont désactivées', () => {
    const config = buildConfig(DEFAULT_AUTOMATION, off, library);
    expect(config.rotation.enabled).toBe(false);
    expect(config.dynamic.enabled).toBe(false);
    expect(config.focus.enabled).toBe(false);
  });

  it('rotation depuis les favoris (récents d’abord) ou une collection', () => {
    expect(rotationItems(FAVORITES_SOURCE, library).map((w) => w.id)).toEqual(['b', 'a']);
    expect(rotationItems('col', library).map((w) => w.id)).toEqual(['c', 'a']);
    const config = buildConfig({ ...DEFAULT_AUTOMATION, rotation: { ...DEFAULT_AUTOMATION.rotation, source: 'col' } }, { ...off, rotation: true }, library);
    expect(config.rotation.items).toEqual([
      { id: 'c', uri: '/data/creations/c.jpg' },
      { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' },
    ]);
  });

  it('créneaux horaires : seuls ceux qui ont un fond sont envoyés', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, slots: { morning: 'a', night: 'c', day: 'inconnu' } } };
    const config = buildConfig(prefs, { ...off, dynamic: true }, library);
    expect(config.dynamic.time?.slots).toEqual([
      { start: '06:00', item: { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' } },
      { start: '22:00', item: { id: 'c', uri: '/data/creations/c.jpg' } },
    ]);
  });

  it('météo sans lieu : pas de configuration météo', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, mode: 'weather' as const, weather: { rain: 'a' } } };
    expect(buildConfig(prefs, { ...off, dynamic: true }, library).dynamic.weather).toBeUndefined();
    const withPlace = { ...prefs, dynamic: { ...prefs.dynamic, place: { name: 'Lyon', latitude: 45.76, longitude: 4.84 } } };
    expect(buildConfig(withPlace, { ...off, dynamic: true }, library).dynamic.weather).toEqual({
      latitude: 45.76,
      longitude: 4.84,
      items: { rain: { id: 'a', uri: 'https://images.unsplash.com/a?fm=jpg' } },
    });
  });

  it('batterie : niveaux et recharge', () => {
    const prefs = { ...DEFAULT_AUTOMATION, dynamic: { ...DEFAULT_AUTOMATION.dynamic, mode: 'battery' as const, battery: { low: 'b', charging: 'c' } } };
    const config = buildConfig(prefs, { ...off, dynamic: true }, library);
    expect(config.dynamic.battery?.levels).toEqual([{ min: 0, item: { id: 'b', uri: 'https://images.unsplash.com/b?fm=jpg' } }]);
    expect(config.dynamic.battery?.charging?.id).toBe('c');
  });

  it('mode focus : plages valides uniquement, jours triés', () => {
    const prefs = {
      ...DEFAULT_AUTOMATION,
      focus: {
        target: 'lock' as const,
        wallpaperId: 'c',
        schedules: [
          { id: '1', days: [5, 1], start: '09:00', end: '12:00' },
          { id: '2', days: [], start: '13:00', end: '14:00' },
          { id: '3', days: [6], start: '10:00', end: '10:00' },
        ],
      },
    };
    const config = buildConfig(prefs, { ...off, focus: true }, library);
    expect(config.focus).toEqual({
      enabled: true,
      target: 'lock',
      item: { id: 'c', uri: '/data/creations/c.jpg' },
      schedules: [{ days: [1, 5], start: '09:00', end: '12:00' }],
    });
  });
});
