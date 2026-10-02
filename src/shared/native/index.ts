import { Capacitor, registerPlugin } from '@capacitor/core';
import { t } from '@/shared/i18n';
import type { PrismeWallpaperPlugin } from './definitions';

export * from './definitions';

// Une seule instance web : Capacitor peut appeler ce chargeur pour plusieurs appels simultanés.
let webInstance: Promise<PrismeWallpaperPlugin> | undefined;

export const PrismeWallpaper = registerPlugin<PrismeWallpaperPlugin>('PrismeWallpaper', {
  web: () => (webInstance ??= import('./web').then((m) => new m.PrismeWallpaperWeb())),
});

export const isNative = Capacitor.isNativePlatform();

/** URL affichable dans la WebView pour un chemin renvoyé par le plugin (fichier local ou URL distante). */
export function toWebUrl(path: string): string {
  if (/^(https?:|blob:|data:)/.test(path)) return path;
  return Capacitor.convertFileSrc(path);
}

/**
 * Messages du natif dont une partie varie (code HTTP, taille, dossier…) : motif reconnu, texte français à
 * traduire (clé de la table) et valeurs à y mettre. Les autres messages sont des phrases fixes, traduites telles quelles.
 */
const NATIVE_PATTERNS: readonly { match: RegExp; text: string; vars: (m: RegExpExecArray) => Record<string, string> }[] = [
  { match: /^Téléchargement impossible \(HTTP (\d+)\)$/, text: 'Téléchargement impossible (HTTP {code})', vars: (m) => ({ code: m[1] ?? '' }) },
  { match: /^Impossible de créer le dossier (.+)$/, text: 'Impossible de créer le dossier {folder}', vars: (m) => ({ folder: m[1] ?? '' }) },
  {
    match: /^(Cette vidéo|Ce GIF) pèse (\d+) Mo : la limite est de (\d+) Mo\.$/,
    text: '{subject} pèse {size} Mo : la limite est de {limit} Mo.',
    vars: (m) => ({ subject: t(m[1] ?? ''), size: m[2] ?? '', limit: m[3] ?? '' }),
  },
  {
    match: /^(Cette vidéo|Ce GIF) dépasse la limite de (\d+) Mo\.$/,
    text: '{subject} dépasse la limite de {limit} Mo.',
    vars: (m) => ({ subject: t(m[1] ?? ''), limit: m[2] ?? '' }),
  },
  { match: /^Scan impossible : ([\s\S]+)$/, text: 'Scan impossible : {reason}', vars: (m) => ({ reason: t(m[1] ?? '') }) },
];

/** Message du natif (écrit en français) dans la langue de l'interface. */
export function translateNativeMessage(message: string): string {
  for (const { match, text, vars } of NATIVE_PATTERNS) {
    const found = match.exec(message);
    if (found) return t(text, vars(found));
  }
  return t(message);
}

/** Message lisible pour une erreur renvoyée par le plugin natif, dans la langue de l'interface. */
export function nativeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return translateNativeMessage(error.message);
  }
  return t('Une erreur inattendue est survenue');
}
