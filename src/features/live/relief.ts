import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { PrismeLive, type ReliefInfo, type ReliefProgress } from '@/shared/native/automation';

/** Réglages de la scène « Relief 3D », envoyés au natif avec le genre. */
export type ReliefSettings = {
  /** Profondeur de l'effet, de 0 (subtile) à 1 (prononcée). */
  depth: number;
  /** Ombre douce du sujet sur l'arrière-plan. */
  shadow: boolean;
};

export const RELIEF_DEFAULTS: ReliefSettings = { depth: 0.5, shadow: true };

interface ReliefState {
  /** Photo choisie pour le relief. */
  wallpaper: Wallpaper | null;
  /** Photo dont le relief a été préparé sur l'appareil (le choix d'une autre photo demande une nouvelle préparation). */
  preparedId: string | null;
}

export const useRelief = create<ReliefState>()(
  persist(() => ({ wallpaper: null, preparedId: null }) as ReliefState, { name: 'prisme-relief' }),
);

/** Relief prêt pour la photo choisie : le natif l'a préparé, et pour cette photo-là. */
export function reliefReady(info: ReliefInfo | undefined, wallpaper: Wallpaper | null, preparedId: string | null): boolean {
  return !!info?.ready && !!wallpaper && wallpaper.id === preparedId;
}

/** Texte de l'étape en cours de la préparation. */
export function reliefStageLabel({ stage, progress }: ReliefProgress): string {
  switch (stage) {
    case 'image':
      return 'Préparation de la photo…';
    case 'module':
      return progress !== undefined && progress < 1
        ? `Téléchargement du module de détourage… ${Math.round(progress * 100)} %`
        : 'Téléchargement du module de détourage…';
    case 'segment':
      return 'Détourage du sujet…';
    case 'compose':
      return 'Comblement de l’arrière-plan…';
  }
}

/**
 * Prépare le relief de [wallpaper] sur l'appareil : détourage du sujet, arrière-plan comblé derrière lui.
 * [onProgress] suit les étapes. La photo est retenue comme préparée seulement en cas de réussite.
 */
export async function prepareRelief(wallpaper: Wallpaper, onProgress: (progress: ReliefProgress) => void): Promise<ReliefInfo> {
  const handle = await PrismeLive.addListener('reliefProgress', onProgress);
  try {
    const info = await PrismeLive.prepareRelief({ uri: applyUri(wallpaper) });
    useRelief.setState({ wallpaper, preparedId: wallpaper.id });
    return info;
  } finally {
    void handle.remove();
  }
}
