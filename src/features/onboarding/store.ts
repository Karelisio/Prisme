import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ColorFilter } from '@/features/sources/types';

/** Goûts choisis à l'introduction : ils orientent « Pour toi » tant que les favoris ne suffisent pas. */
export interface Tastes {
  /** Clés des catégories d'Explorer (« nature », « space »…). */
  categories: string[];
  colors: ColorFilter[];
}

export const EMPTY_TASTES: Tastes = { categories: [], colors: [] };

/** Au-delà, « Pour toi » interrogerait trop de sources à chaque page. */
export const MAX_TASTE_CATEGORIES = 4;
export const MAX_TASTE_COLORS = 3;

export const ONBOARDING_STORAGE_KEY = 'prisme-onboarding';

/** Réglages enregistrés par les versions sans introduction : leur présence trahit une installation existante. */
const PREVIOUS_KEYS = [
  'prisme-settings',
  'prisme-browse',
  'prisme-discover',
  'prisme-automation',
  'prisme-live',
  'prisme-music',
  'prisme-relief',
  'prisme-updates',
];

/**
 * Valeur de départ de « vue » : une installation qui existait avant l'introduction (mise à jour de
 * l'app) ne la voit pas ; seul un tout premier lancement la montre. Stockage indisponible : on
 * ne l'impose pas.
 */
function initiallySeen(): boolean {
  try {
    if (localStorage.getItem(ONBOARDING_STORAGE_KEY) !== null) return false;
    return PREVIOUS_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch {
    return true;
  }
}

interface OnboardingState {
  /** L'introduction a été terminée ou passée : elle ne s'affiche plus d'elle-même. */
  seen: boolean;
  tastes: Tastes;
  /** Ferme l'introduction (terminée ou passée) ; sans argument, les goûts restent ceux d'avant. */
  finish: (tastes?: Tastes) => void;
  /** « Revoir l'introduction » (Réglages). */
  reopen: () => void;
}

const sanitize = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: initiallySeen(),
      tastes: EMPTY_TASTES,
      finish: (tastes) => set((s) => ({ seen: true, tastes: tastes ?? s.tastes })),
      reopen: () => set({ seen: false }),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ seen, tastes }) => ({ seen, tastes }),
      merge: (persisted, current) => {
        const saved = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<OnboardingState>;
        return {
          ...current,
          seen: typeof saved.seen === 'boolean' ? saved.seen : current.seen,
          tastes: {
            categories: sanitize(saved.tastes?.categories),
            colors: sanitize(saved.tastes?.colors) as ColorFilter[],
          },
        };
      },
    },
  ),
);

// Premier lancement : la décision est enregistrée tout de suite, pour qu'une fermeture avant la fin de
// l'introduction (ou un réglage modifié entre-temps) ne la fasse pas passer pour une installation existante.
if (!useOnboarding.getState().seen) useOnboarding.setState({ seen: false });
