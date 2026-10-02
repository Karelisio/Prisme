import { planUndo } from '@/features/library/model';
import { useLibrary } from '@/features/library/store';
import { setLiveWallpaper } from '@/features/live/live';
import { applyUri } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { trackUnsplashDownload } from '@/features/sources/unsplash';
import { t } from '@/shared/i18n';
import { type NormalizedRect, PrismeWallpaper, type WallpaperTarget } from '@/shared/native';

/** Noms des écrans, dans la langue de l'interface (lus au moment de l'affichage). */
export const TARGET_LABELS: Record<WallpaperTarget, string> = {
  get home() {
    return t("Écran d'accueil");
  },
  get lock() {
    return t('Écran de verrouillage');
  },
  get both() {
    return t('Accueil et verrouillage');
  },
};

export interface ApplyRequest {
  wallpaper: Wallpaper;
  target: WallpaperTarget;
  crop?: NormalizedRect;
  /** Image déjà préparée (éditeur, fonds liés) : remplace la source du fond. */
  uri?: string;
  /** false : essai, ne devient pas le fond à restaurer après un automatisme. */
  remember?: boolean;
  /** false : pas d'entrée d'historique (restauration lors d'une annulation). */
  recordHistory?: boolean;
}

/**
 * Applique un fond : pleine résolution à ce moment-là seulement (copie hors ligne si elle existe),
 * puis historique et suivi de téléchargement Unsplash.
 */
export async function applyWallpaper({ wallpaper, target, crop, uri, remember = true, recordHistory = true }: ApplyRequest): Promise<void> {
  const imageCrop = uri ? undefined : crop;
  await PrismeWallpaper.setWallpaper({ uri: uri ?? applyUri(wallpaper), target, crop: imageCrop, id: wallpaper.id, remember });
  if (!recordHistory) return;
  useLibrary.getState().addHistory(wallpaper, target, { crop: imageCrop, uri });
  if (wallpaper.source === 'unsplash' && wallpaper.downloadLocation) {
    void trackUnsplashDownload(wallpaper.downloadLocation);
  }
}

const SCREEN_NAMES = { home: "l'écran d'accueil", lock: "l'écran de verrouillage" } as const;

/**
 * Revient au fond d'avant la dernière application (sur le ou les écrans concernés) et retire
 * cette application de l'historique ; renvoie le message à afficher.
 */
export async function undoLastApply(): Promise<string> {
  const { history, items, removeHistory } = useLibrary.getState();
  const plan = planUndo(history);
  const steps = plan?.steps.filter((step) => items[step.entry.wallpaperId]) ?? [];
  if (!plan || steps.length === 0) return t('Aucun fond précédent à restaurer');
  for (const step of steps) {
    const wallpaper = items[step.entry.wallpaperId];
    if (wallpaper) await applyWallpaper({ wallpaper, target: step.target, crop: step.entry.crop, uri: step.entry.uri, recordHistory: false });
  }
  removeHistory(plan.undone.id);
  const [missing] = plan.missing;
  return missing && plan.missing.length === 1
    ? t('Fond précédent restauré, sauf sur {screen}', { screen: t(SCREEN_NAMES[missing]) })
    : t('Fond précédent restauré');
}

/** Choix proposés par la feuille « Appliquer sur ». */
export type ApplyChoice = WallpaperTarget | 'live' | 'linked';

/** Applique une création (éditeur, générateur) selon le choix ; renvoie le message à afficher. */
export async function applyCreation(creation: Wallpaper, choice: Exclude<ApplyChoice, 'linked'>): Promise<string> {
  if (choice === 'live') return setLiveWallpaper(creation);
  await applyWallpaper({ wallpaper: creation, target: choice });
  return t('Fond appliqué : {screen}', { screen: TARGET_LABELS[choice].toLowerCase() });
}
