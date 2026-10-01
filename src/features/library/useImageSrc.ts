import type { Wallpaper } from '@/features/sources/types';
import { toWebUrl } from '@/shared/native';
import { useLibrary } from './store';

/** Miniature : copie locale si elle existe (hors ligne, plus rapide), sinon l'URL distante. */
export function useThumbSrc(w: Wallpaper): string {
  const local = useLibrary((s) => s.offline[w.id]?.thumbPath);
  return toWebUrl(local ?? w.thumb);
}

/** Image d'aperçu : copie pleine résolution locale si disponible, sinon l'aperçu distant. */
export function usePreviewSrc(w: Wallpaper): string {
  const local = useLibrary((s) => s.offline[w.id]?.fullPath);
  return toWebUrl(local ?? w.preview);
}

/** Source à envoyer au plugin pour appliquer le fond (copie hors ligne en priorité). */
export function applyUri(w: Wallpaper): string {
  return useLibrary.getState().offline[w.id]?.fullPath ?? w.full;
}
