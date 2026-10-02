import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Wallpaper } from '@/features/sources/types';
import { type Hidden, type HiddenAuthor, type HiddenWallpaper, authorKey } from './hidden';
import { normalize } from './keywords';

/** Photographe Unsplash suivi. */
export interface Photographer {
  username: string;
  name: string;
  url: string;
  at?: number;
}

/** Photographe Unsplash d'un fond (page dédiée et abonnement), sinon null. */
export function photographerOf(w: Wallpaper): Photographer | null {
  if (w.source !== 'unsplash' || !w.author?.username) return null;
  return { username: w.author.username, name: w.author.name, url: w.author.url };
}

export interface DailyPick {
  /** Jour local « AAAA-MM-JJ ». */
  day: string;
  wallpaper: Wallpaper;
}

export interface DiscoverData extends Hidden {
  following: Photographer[];
  daily: DailyPick | null;
}

interface DiscoverActions {
  hideWallpaper: (w: Wallpaper) => void;
  unhideWallpaper: (id: string) => void;
  hideAuthor: (w: Wallpaper) => void;
  unhideAuthor: (key: string) => void;
  addHiddenWord: (word: string) => void;
  removeHiddenWord: (word: string) => void;
  clearHidden: () => void;
  follow: (p: Photographer) => void;
  unfollow: (username: string) => void;
  setDaily: (pick: DailyPick) => void;
}

export const EMPTY_DISCOVER: DiscoverData = { hiddenIds: {}, hiddenAuthors: {}, hiddenWords: [], following: [], daily: null };

export const useDiscover = create<DiscoverData & DiscoverActions>()(
  persist(
    (set) => ({
      ...EMPTY_DISCOVER,
      hideWallpaper: (w) =>
        set((s) => {
          const entry: HiddenWallpaper = { id: w.id, thumb: w.thumb, alt: w.alt, at: Date.now() };
          return { hiddenIds: { ...s.hiddenIds, [w.id]: entry } };
        }),
      unhideWallpaper: (id) =>
        set((s) => {
          const { [id]: _removed, ...hiddenIds } = s.hiddenIds;
          return { hiddenIds };
        }),
      hideAuthor: (w) =>
        set((s) => {
          const key = authorKey(w);
          if (!key || !w.author) return s;
          const entry: HiddenAuthor = { key, name: w.author.name, source: w.source, at: Date.now() };
          return { hiddenAuthors: { ...s.hiddenAuthors, [key]: entry } };
        }),
      unhideAuthor: (key) =>
        set((s) => {
          const { [key]: _removed, ...hiddenAuthors } = s.hiddenAuthors;
          return { hiddenAuthors };
        }),
      addHiddenWord: (word) =>
        set((s) => {
          const w = word.trim().replace(/\s+/g, ' ');
          if (!w || s.hiddenWords.some((x) => normalize(x) === normalize(w))) return s;
          return { hiddenWords: [...s.hiddenWords, w] };
        }),
      removeHiddenWord: (word) => set((s) => ({ hiddenWords: s.hiddenWords.filter((w) => w !== word) })),
      clearHidden: () => set({ hiddenIds: {}, hiddenAuthors: {}, hiddenWords: [] }),
      follow: (p) =>
        set((s) => (s.following.some((f) => f.username === p.username) ? s : { following: [{ ...p, at: Date.now() }, ...s.following] })),
      unfollow: (username) => set((s) => ({ following: s.following.filter((f) => f.username !== username) })),
      setDaily: (daily) => set({ daily }),
    }),
    {
      name: 'prisme-discover',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ hiddenIds, hiddenAuthors, hiddenWords, following, daily }) => ({ hiddenIds, hiddenAuthors, hiddenWords, following, daily }),
    },
  ),
);

export const hiddenCount = (s: Hidden) => Object.keys(s.hiddenIds).length + Object.keys(s.hiddenAuthors).length + s.hiddenWords.length;
