import { useSettings } from '@/features/settings/store';
import { screenSizedUrl } from '@/features/sources/sizing';
import type { Wallpaper } from '@/features/sources/types';
import { useNetwork } from '@/shared/lib/network';
import { currentScreenInfo } from '@/shared/lib/screen';
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

/** Données mobiles avec l'option « HD seulement en Wi-Fi » : images à la taille de l'écran. */
export function savingData(): boolean {
  return useSettings.getState().hdOnWifiOnly && useNetwork.getState().metered;
}

/**
 * Source à envoyer au plugin pour appliquer, enregistrer ou partager le fond : copie hors ligne
 * en priorité, sinon la HD (ou une version à la taille de l'écran pour économiser les données).
 */
export function applyUri(w: Wallpaper): string {
  const local = useLibrary.getState().offline[w.id]?.fullPath;
  if (local) return local;
  return savingData() ? screenSizedUrl(w, currentScreenInfo()) : w.full;
}
