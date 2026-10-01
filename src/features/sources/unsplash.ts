import { env } from '@/shared/config/env';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { unsplashColor } from './filters';
import { ApiError, type ColorFilter, type SourcePage, type Wallpaper } from './types';

const API = 'https://api.unsplash.com';
const PER_PAGE = 30;

export interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string | null;
  alt_description: string | null;
  description: string | null;
  urls: { raw: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

interface SearchResponse {
  total_pages: number;
  results: UnsplashPhoto[];
}

export function withUtm(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${env.appUtm}`;
}

/** Convertit une photo Unsplash ; les tailles d'image passent par les paramètres imgix de l'URL brute. */
export function mapUnsplash(photo: UnsplashPhoto, thumbWidth: number): Wallpaper {
  const thumbHeight = Math.round((thumbWidth * 16) / 9);
  return {
    id: `unsplash:${photo.id}`,
    source: 'unsplash',
    width: photo.width,
    height: photo.height,
    color: photo.color ?? '#808080',
    alt: photo.alt_description ?? photo.description ?? 'Photo Unsplash',
    thumb: withParams(photo.urls.raw, { w: thumbWidth, h: thumbHeight, fit: 'crop', q: 60, auto: 'format' }),
    preview: withParams(photo.urls.raw, { w: 1080, fit: 'max', q: 80, auto: 'format' }),
    full: withParams(photo.urls.raw, { w: Math.min(photo.width, 3200), fit: 'max', q: 90, fm: 'jpg' }),
    author: { name: photo.user.name, url: withUtm(photo.user.links.html) },
    pageUrl: withUtm(photo.links.html),
    downloadLocation: photo.links.download_location,
  };
}

async function request<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (!env.unsplashKey) throw new ApiError('unsplash', 'missing_key', 'Clé Unsplash manquante');
  let res;
  try {
    res = await getJson<T>(withParams(`${API}${path}`, params), {
      Authorization: `Client-ID ${env.unsplashKey}`,
      'Accept-Version': 'v1',
    });
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('unsplash', 'network', 'Unsplash injoignable');
    throw error;
  }
  if (res.status >= 200 && res.status < 300) return res.data;
  throw unsplashError(res.status, res.headers, res.data);
}

export function unsplashError(status: number, headers: Record<string, string>, body: unknown): ApiError {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  if (status === 429 || headers['x-ratelimit-remaining'] === '0' || /rate limit/i.test(text)) {
    return new ApiError('unsplash', 'rate_limit', 'Limite de requêtes Unsplash atteinte, réessaie dans une heure');
  }
  if (status === 401 || status === 403) return new ApiError('unsplash', 'auth', 'Clé Unsplash refusée');
  return new ApiError('unsplash', 'server', `Erreur Unsplash (${status})`);
}

function arrayPage(photos: UnsplashPhoto[], page: number, thumbWidth: number): SourcePage {
  return { items: photos.map((p) => mapUnsplash(p, thumbWidth)), next: photos.length < PER_PAGE ? null : page + 1 };
}

export async function unsplashTopic(slug: string, page: number, thumbWidth: number): Promise<SourcePage> {
  const photos = await request<UnsplashPhoto[]>(`/topics/${encodeURIComponent(slug)}/photos`, {
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
  });
  return arrayPage(photos, page, thumbWidth);
}

export async function unsplashCollection(id: string, page: number, thumbWidth: number): Promise<SourcePage> {
  const photos = await request<UnsplashPhoto[]>(`/collections/${encodeURIComponent(id)}/photos`, {
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
  });
  return arrayPage(photos, page, thumbWidth);
}

export async function unsplashSearch(
  query: string,
  page: number,
  thumbWidth: number,
  color: ColorFilter | null,
): Promise<SourcePage> {
  const data = await request<SearchResponse>('/search/photos', {
    query,
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
    color: color ? (unsplashColor(color) ?? undefined) : undefined,
    lang: 'fr',
  });
  return {
    items: data.results.map((p) => mapUnsplash(p, thumbWidth)),
    next: page < data.total_pages ? page + 1 : null,
  };
}

/** Signale un téléchargement à Unsplash (obligatoire quand une photo est utilisée). */
export async function trackUnsplashDownload(downloadLocation: string): Promise<void> {
  if (!env.unsplashKey) return;
  try {
    await getJson(downloadLocation, { Authorization: `Client-ID ${env.unsplashKey}` });
  } catch {
    // Sans conséquence pour l'utilisateur : le suivi sera simplement manqué.
  }
}
