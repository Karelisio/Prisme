import { locale, t } from '@/shared/i18n';
import type { LiveMedia, LiveMediaKind } from '@/shared/native/automation';

/** Poids maximal des fichiers copiés dans l'app, en Mo (mêmes limites que le natif, qui refuse au-delà avec un message). */
export const MEDIA_LIMIT_MB: Record<LiveMediaKind, number> = { video: 300, gif: 50 };

/** Durée d'une vidéo : « 0:15 », « 12:05 » ou « 1:02:03 » (les heures seulement si besoin). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** Poids d'un fichier, à la française : « 820 Ko », « 46,3 Mo », « 1,2 Go » (« 820 KB », « 46.3 MB » en anglais). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} ${t('o')}`;
  const units = [t('Ko'), t('Mo'), t('Go')];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // Une décimale sous 100, aucune au-delà ; « 3 Mo » plutôt que « 3,0 Mo ».
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString(locale(), { useGrouping: false })} ${units[unit]}`;
}

/** Ce qu'on sait du fichier choisi, sur une ligne : « 0:15 · 46,3 Mo · 1080 × 1920 » (pas de durée pour un GIF). */
export function mediaDetails(media: LiveMedia): string {
  return [
    media.durationMs === undefined ? '' : formatDuration(media.durationMs),
    formatSize(media.sizeBytes),
    media.width > 0 && media.height > 0 ? `${media.width} × ${media.height}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
