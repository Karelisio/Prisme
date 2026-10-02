import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { DEFAULT_UNLOCK, PLAYLIST_LIMIT, PLAYLIST_OFF, UNLOCK_FREQUENCIES, buildPlaylist } from './playlist';

const wp = (id: string): Wallpaper => ({
  id,
  source: 'unsplash',
  width: 1080,
  height: 2400,
  color: '#000',
  alt: id,
  thumb: `t/${id}`,
  preview: `p/${id}`,
  full: `https://images.unsplash.com/${id}?fm=jpg`,
});

const library = {
  items: { a: wp('a'), b: wp('b'), c: wp('c') },
  favorites: { a: 1, b: 2 },
  collections: [{ id: 'col', name: 'Nuit', createdAt: 0, itemIds: ['c', 'a', 'disparu'] }],
};

// Copie hors ligne pour « a », comme `applyUri`.
const uriFor = (w: Wallpaper) => (w.id === 'a' ? '/data/offline/a.jpg' : w.full);
const on = { ...DEFAULT_UNLOCK, enabled: true };

describe('changer à chaque déverrouillage : liste envoyée au natif', () => {
  it('favoris du plus récent au plus ancien, avec l’URI d’application et la fréquence choisie', () => {
    expect(buildPlaylist({ ...on, every: 5 }, true, library, uriFor)).toEqual({
      enabled: true,
      every: 5,
      items: [
        { id: 'b', uri: 'https://images.unsplash.com/b?fm=jpg' },
        { id: 'a', uri: '/data/offline/a.jpg' },
      ],
    });
  });

  it('une collection, sans les fonds disparus', () => {
    const playlist = buildPlaylist({ ...on, source: 'col' }, true, library, uriFor);
    expect(playlist.items.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('rien à envoyer sans l’option, sans interrupteur ou avec moins de deux fonds', () => {
    expect(buildPlaylist(DEFAULT_UNLOCK, true, library, uriFor)).toBe(PLAYLIST_OFF);
    expect(buildPlaylist(on, false, library, uriFor)).toBe(PLAYLIST_OFF);
    expect(buildPlaylist(on, true, { ...library, favorites: { a: 1 } }, uriFor)).toBe(PLAYLIST_OFF);
    expect(buildPlaylist({ ...on, source: 'inconnue' }, true, library, uriFor)).toBe(PLAYLIST_OFF);
  });

  it('double-tap seul : la liste est préparée, sans changement au déverrouillage', () => {
    expect(buildPlaylist(DEFAULT_UNLOCK, true, library, uriFor, true)).toEqual({
      enabled: true,
      every: 1,
      unlock: false,
      items: [
        { id: 'b', uri: 'https://images.unsplash.com/b?fm=jpg' },
        { id: 'a', uri: '/data/offline/a.jpg' },
      ],
    });
    // Les deux : la liste sert aussi au déverrouillage.
    expect(buildPlaylist(on, true, library, uriFor, true)).not.toHaveProperty('unlock');
    expect(buildPlaylist(DEFAULT_UNLOCK, false, library, uriFor, true)).toBe(PLAYLIST_OFF);
  });

  it('nombre de fonds borné', () => {
    const many = Object.fromEntries(Array.from({ length: PLAYLIST_LIMIT + 20 }, (_, i) => [`w${i}`, wp(`w${i}`)]));
    const favorites = Object.fromEntries(Object.keys(many).map((id, i) => [id, i]));
    const playlist = buildPlaylist(on, true, { items: many, favorites, collections: [] }, uriFor);
    expect(playlist.items).toHaveLength(PLAYLIST_LIMIT);
    // Les plus récents d'abord.
    expect(playlist.items[0]?.id).toBe(`w${PLAYLIST_LIMIT + 19}`);
  });

  it('fréquences proposées : chaque fois, 3, 5 et 10 déverrouillages', () => {
    expect(UNLOCK_FREQUENCIES.map((f) => [f.every, f.label])).toEqual([
      [1, 'Chaque fois'],
      [3, '3'],
      [5, '5'],
      [10, '10'],
    ]);
  });
});
