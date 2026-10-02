import { env } from '@/shared/config/env';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR, pexelsColor } from './filters';
import { ApiError, type ColorChoice, type SourcePage, type Wallpaper } from './types';

const API = 'https://api.pexels.com/v1';
const PER_PAGE = 40;

export interface PexelsPhoto {
  id: number;
  type?: string;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color: string | null;
  alt: string | null;
  src: { original: string };
}

interface PhotosResponse {
  photos?: PexelsPhoto[];
  media?: PexelsPhoto[];
  next_page?: string;
}

/** Convertit une photo Pexels ; les tailles passent par les paramètres du CDN Pexels. */
export function mapPexels(photo: PexelsPhoto, thumbWidth: number): Wallpaper {
  const base = photo.src.original;
  const thumbHeight = Math.round((thumbWidth * 16) / 9);
  return {
    id: `pexels:${photo.id}`,
    source: 'pexels',
    width: photo.width,
    height: photo.height,
    color: photo.avg_color ?? UNKNOWN_COLOR,
    alt: photo.alt || 'Photo Pexels',
    thumb: withParams(base, { auto: 'compress', cs: 'tinysrgb', fit: 'crop', w: thumbWidth, h: thumbHeight }),
    preview: withParams(base, { auto: 'compress', cs: 'tinysrgb', w: 1080 }),
    full: withParams(base, { auto: 'compress', cs: 'tinysrgb', w: Math.min(photo.width, 3200) }),
    author: { name: photo.photographer, url: photo.photographer_url },
    pageUrl: photo.url,
  };
}

type Params = Record<string, string | number | undefined>;

/** `optional` : un 404 (photo retirée) donne null au lieu d'une erreur. */
async function request<T = PhotosResponse>(path: string, params: Params, optional: true): Promise<T | null>;
async function request<T = PhotosResponse>(path: string, params: Params): Promise<T>;
async function request<T = PhotosResponse>(path: string, params: Params, optional = false): Promise<T | null> {
  if (!env.pexelsKey) throw new ApiError('pexels', 'missing_key', 'Clé Pexels manquante');
  let res;
  try {
    res = await getJson<T>(withParams(`${API}${path}`, params), { Authorization: env.pexelsKey });
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('pexels', 'network', 'Pexels injoignable');
    throw error;
  }
  if (res.status >= 200 && res.status < 300) return res.data;
  if (optional && res.status === 404) return null;
  if (res.status === 429) throw new ApiError('pexels', 'rate_limit', 'Limite de requêtes Pexels atteinte, réessaie plus tard');
  if (res.status === 401 || res.status === 403) throw new ApiError('pexels', 'auth', 'Clé Pexels refusée');
  throw new ApiError('pexels', 'server', `Erreur Pexels (${res.status})`);
}

function toPage(data: PhotosResponse, page: number, thumbWidth: number): SourcePage {
  const photos = (data.photos ?? data.media ?? []).filter((p) => !p.type || p.type === 'Photo');
  return { items: photos.map((p) => mapPexels(p, thumbWidth)), next: data.next_page ? page + 1 : null };
}

export async function pexelsCurated(page: number, thumbWidth: number): Promise<SourcePage> {
  return toPage(await request('/curated', { page, per_page: PER_PAGE }), page, thumbWidth);
}

export async function pexelsSearch(
  query: string,
  page: number,
  thumbWidth: number,
  color: ColorChoice | null,
): Promise<SourcePage> {
  const data = await request('/search', {
    query,
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
    color: color ? (pexelsColor(color) ?? undefined) : undefined,
    locale: 'fr-FR',
  });
  return toPage(data, page, thumbWidth);
}

export async function pexelsCollection(id: string, page: number, thumbWidth: number): Promise<SourcePage> {
  const data = await request(`/collections/${encodeURIComponent(id)}`, { type: 'photos', page, per_page: PER_PAGE });
  return toPage(data, page, thumbWidth);
}

/** Une photo par son identifiant (collection reçue) ; null si elle n'existe plus. */
export async function pexelsPhoto(id: string, thumbWidth: number): Promise<Wallpaper | null> {
  const photo = await request<PexelsPhoto>(`/photos/${encodeURIComponent(id)}`, {}, true);
  return photo?.src?.original ? mapPexels(photo, thumbWidth) : null;
}
