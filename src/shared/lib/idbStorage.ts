import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/** Stockage IndexedDB pour les états volumineux (bibliothèque) : localStorage est limité et synchrone. */
export const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
};
