import type { WallpaperTarget } from '@/shared/native';
import type { MusicConfig, MusicStatus } from '@/shared/native/music';
import type { IconName } from '@/shared/ui/icons';

/** Choix de l'utilisateur ; l'option elle-même (activée ou non) est dans les réglages, `features.music`. */
export interface MusicPrefs {
  target: WallpaperTarget;
  /** Remet le fond précédent quand la musique s'arrête. */
  restore: boolean;
}

export const DEFAULT_MUSIC_PREFS: MusicPrefs = { target: 'both', restore: true };

/** Réglages envoyés au natif, qui travaille app fermée. */
export function buildMusicConfig(enabled: boolean, prefs: MusicPrefs): MusicConfig {
  return { enabled, target: prefs.target, restore: prefs.restore };
}

/** Ce que l'écran annonce : accès manquant, option coupée, pochette posée ou tout est prêt. */
export type MusicStatusKind = 'access' | 'off' | 'showing' | 'ready';

export function musicStatusKind(status: Pick<MusicStatus, 'accessGranted' | 'showing'>, enabled: boolean): MusicStatusKind {
  if (!status.accessGranted) return 'access';
  if (!enabled) return 'off';
  return status.showing ? 'showing' : 'ready';
}

/** Textes en français (données) : `t(text)` à l'affichage. */
export const MUSIC_STATUS: Record<MusicStatusKind, { icon: IconName; text: string }> = {
  access: { icon: 'info', text: "Autorise l'accès aux notifications" },
  off: { icon: 'info', text: 'Option désactivée : active-la pour afficher la pochette' },
  showing: { icon: 'musicNote', text: 'Pochette affichée en ce moment' },
  ready: { icon: 'checkCircle', text: "Prêt : la pochette s'affiche dès qu'une musique joue" },
};
