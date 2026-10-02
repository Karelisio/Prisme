import { env } from '@/shared/config/env';
import { t } from '@/shared/i18n';
import type { RemoteSource, WallpaperSource } from './types';

export interface SourceInfo {
  name: string;
  /** Texte affiché sous l'interrupteur de la source dans les réglages. */
  description: string;
  /** Clé API nécessaire (fournie au build), le cas échéant. */
  key?: () => string;
  enabledByDefault: boolean;
  license?: { label: string; url: string };
  /** Rôle de l'auteur dans « Informations » (photographe, artiste…). */
  authorRole: string;
}

export const REMOTE_SOURCES: readonly RemoteSource[] = ['unsplash', 'pexels', 'wallhaven', 'pixabay', 'art', 'nasa'];

export const SOURCE_INFO: Record<RemoteSource, SourceInfo> = {
  unsplash: {
    name: 'Unsplash',
    description: 'Photos, thème Wallpapers en priorité',
    key: () => env.unsplashKey,
    enabledByDefault: true,
    license: { label: 'Licence Unsplash', url: 'https://unsplash.com/license' },
    authorRole: 'Photographe',
  },
  pexels: {
    name: 'Pexels',
    description: 'Photos libres de droits',
    key: () => env.pexelsKey,
    enabledByDefault: true,
    license: { label: 'Licence Pexels', url: 'https://www.pexels.com/license/' },
    authorRole: 'Photographe',
  },
  wallhaven: {
    name: 'Wallhaven',
    description: 'Fonds d’écran, art, anime et jeux (tout public)',
    enabledByDefault: true,
    authorRole: 'Auteur',
  },
  pixabay: {
    name: 'Pixabay',
    description: 'Photos libres de droits, 1280 px au plus',
    key: () => env.pixabayKey,
    enabledByDefault: false,
    license: { label: 'Licence Pixabay', url: 'https://pixabay.com/service/license-summary/' },
    authorRole: 'Photographe',
  },
  art: {
    name: 'Cleveland Museum of Art',
    description: 'Peintures du domaine public (catégorie Art)',
    enabledByDefault: true,
    license: { label: 'Domaine public (CC0)', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.fr' },
    authorRole: 'Artiste',
  },
  nasa: {
    name: 'NASA',
    description: 'Galaxies, planètes et Terre vue de l’espace (catégorie Espace)',
    enabledByDefault: true,
    license: { label: 'Images de la NASA', url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
    authorRole: 'Crédit',
  },
};

const LOCAL_NAMES: Record<Exclude<WallpaperSource, RemoteSource>, string> = {
  pack: 'Pack Prisme',
  device: 'Galerie du téléphone',
  creation: 'Création Prisme',
};

export function sourceLabel(source: WallpaperSource): string {
  return source in SOURCE_INFO ? SOURCE_INFO[source as RemoteSource].name : t(LOCAL_NAMES[source as keyof typeof LOCAL_NAMES]);
}

export type SourceToggles = Record<RemoteSource, boolean>;

export const DEFAULT_SOURCES: SourceToggles = Object.fromEntries(
  REMOTE_SOURCES.map((s) => [s, SOURCE_INFO[s].enabledByDefault]),
) as SourceToggles;

/** La source a sa clé API dans ce build (ou n'en a pas besoin). */
export function hasKey(source: RemoteSource): boolean {
  const key = SOURCE_INFO[source].key;
  return !key || key() !== '';
}

/** Sources interrogées : activées dans les réglages et utilisables avec ce build. */
export function usableSources(enabled: Partial<SourceToggles>): SourceToggles {
  return Object.fromEntries(REMOTE_SOURCES.map((s) => [s, (enabled[s] ?? SOURCE_INFO[s].enabledByDefault) && hasKey(s)])) as SourceToggles;
}
