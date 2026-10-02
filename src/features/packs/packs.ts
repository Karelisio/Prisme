import bundledManifest from '../../../packs/packs.json';
import { env } from '@/shared/config/env';
import { t } from '@/shared/i18n';
import { getJson } from '@/shared/lib/http';
import type { FeedSpec, SourceQuery } from '@/features/sources/feed';
import type { ColorFilter, Wallpaper } from '@/features/sources/types';

/** Image hébergée directement (par exemple dans le dossier packs/ du dépôt). */
export interface PackImage {
  url: string;
  thumb?: string;
  width: number;
  height: number;
  color?: string;
  author?: string;
  authorUrl?: string;
}

export type PackSource =
  | { type: 'unsplash-search'; query: string; color?: ColorFilter }
  | { type: 'unsplash-topic'; slug: string }
  | { type: 'unsplash-collection'; id: string }
  | { type: 'pexels-search'; query: string; color?: ColorFilter }
  | { type: 'pexels-collection'; id: string }
  | { type: 'images'; items: PackImage[] };

export interface Pack {
  id: string;
  title: string;
  description: string;
  /** Deux couleurs pour la vignette du pack (dégradé). */
  colors: [string, string];
  sources: PackSource[];
}

export interface PacksManifest {
  version: number;
  packs: Pack[];
}

export const BUNDLED_PACKS = bundledManifest as PacksManifest;

export function isManifest(value: unknown): value is PacksManifest {
  if (!value || typeof value !== 'object') return false;
  const packs = (value as PacksManifest).packs;
  return (
    Array.isArray(packs) &&
    packs.every((p) => typeof p.id === 'string' && typeof p.title === 'string' && Array.isArray(p.sources) && Array.isArray(p.colors))
  );
}

/** Manifeste distant (mis à jour sans republier l'app), avec repli sur la copie embarquée. */
export async function loadPacks(): Promise<PacksManifest> {
  try {
    const res = await getJson<unknown>(env.packsUrl);
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.status === 200 && isManifest(data)) return data;
  } catch {
    // Hors ligne ou dépôt inaccessible : la copie embarquée suffit.
  }
  return BUNDLED_PACKS;
}

function imageToWallpaper(pack: Pack, image: PackImage, index: number): Wallpaper {
  return {
    id: `pack:${pack.id}:${index}`,
    source: 'pack',
    width: image.width,
    height: image.height,
    color: image.color ?? pack.colors[0],
    alt: `${t(pack.title)} ${index + 1}`,
    thumb: image.thumb ?? image.url,
    preview: image.url,
    full: image.url,
    author: image.author ? { name: image.author, url: image.authorUrl ?? '' } : undefined,
  };
}

export function packFeed(pack: Pack): FeedSpec {
  const queries = pack.sources.map((source): SourceQuery => {
    switch (source.type) {
      case 'unsplash-search':
        return { kind: 'unsplash-search', query: source.query, color: source.color };
      case 'unsplash-topic':
        return { kind: 'unsplash-topic', slug: source.slug };
      case 'unsplash-collection':
        return { kind: 'unsplash-collection', id: source.id };
      case 'pexels-search':
        return { kind: 'pexels-search', query: source.query, color: source.color };
      case 'pexels-collection':
        return { kind: 'pexels-collection', id: source.id };
      case 'images':
        return { kind: 'static', items: source.items.map((image, i) => imageToWallpaper(pack, image, i)) };
    }
  });
  return { key: `pack:${pack.id}`, queries };
}
