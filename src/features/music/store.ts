import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MUSIC_PREFS, type MusicPrefs } from './model';

interface MusicActions {
  update: (patch: Partial<MusicPrefs>) => void;
}

/** Écran visé et retour au fond précédent : gardés sur le téléphone, puis envoyés au natif (voir musicSync). */
export const useMusicPrefs = create<MusicPrefs & MusicActions>()(
  persist(
    (set) => ({
      ...DEFAULT_MUSIC_PREFS,
      update: (patch) => set(patch),
    }),
    { name: 'prisme-music', version: 1, partialize: ({ target, restore }) => ({ target, restore }) },
  ),
);
