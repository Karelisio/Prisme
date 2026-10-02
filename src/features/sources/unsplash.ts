import { env } from '@/shared/config/env';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR, unsplashColor } from './filters';
import { ApiError, type ColorChoice, type SourcePage, type Wallpaper } from './types';

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
  user: { name: string; username?: string; links: { html: string } };
}

/** Ordre des photos d'un thème ou d'un photographe (« latest » par défaut chez Unsplash). */
export type UnsplashOrder = 'latest' | 'popular';

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
    color: photo.color ?? UNKNOWN_COLOR,
    alt: photo.alt_description ?? photo.description ?? 'Photo Unsplash',
    thumb: withParams(photo.urls.raw, { w: thumbWidth, h: thumbHeight, fit: 'crop', q: 60, auto: 'format' }),
    preview: withParams(photo.urls.raw, { w: 1080, fit: 'max', q: 80, auto: 'format' }),
    full: withParams(photo.urls.raw, { w: Math.min(photo.width, 3200), fit: 'max', q: 90, fm: 'jpg' }),
    author: {
      name: photo.user.name,
      url: withUtm(photo.user.links.html),
      ...(photo.user.username && { username: photo.user.username }),
    },
    pageUrl: withUtm(photo.links.html),
    downloadLocation: photo.links.download_location,
  };
}

type Params = Record<string, string | number | undefined>;

/** `optional` : un 404 (photo supprimée) donne null au lieu d'une erreur. */
async function request<T>(path: string, params: Params, optional: true): Promise<T | null>;
async function request<T>(path: string, params: Params): Promise<T>;
async function request<T>(path: string, params: Params, optional = false): Promise<T | null> {
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
  if (optional && res.status === 404) return null;
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

export async function unsplashTopic(slug: string, page: number, thumbWidth: number, order?: UnsplashOrder): Promise<SourcePage> {
  const photos = await request<UnsplashPhoto[]>(`/topics/${encodeURIComponent(slug)}/photos`, {
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
    order_by: order,
  });
  return arrayPage(photos, page, thumbWidth);
}

/** Photos d'un photographe, les plus récentes d'abord. */
export async function unsplashUser(username: string, page: number, thumbWidth: number): Promise<SourcePage> {
  const photos = await request<UnsplashPhoto[]>(`/users/${encodeURIComponent(username)}/photos`, {
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
    order_by: 'latest',
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
  color: ColorChoice | null,
  order?: 'latest' | 'relevant',
): Promise<SourcePage> {
  const data = await request<SearchResponse>('/search/photos', {
    query,
    page,
    per_page: PER_PAGE,
    orientation: 'portrait',
    color: color ? (unsplashColor(color) ?? undefined) : undefined,
    order_by: order,
    lang: 'fr',
  });
  return {
    items: data.results.map((p) => mapUnsplash(p, thumbWidth)),
    next: page < data.total_pages ? page + 1 : null,
  };
}

/** Une photo par son identifiant (collection reçue) ; null si elle n'existe plus. */
export async function unsplashPhoto(id: string, thumbWidth: number): Promise<Wallpaper | null> {
  const photo = await request<UnsplashPhoto>(`/photos/${encodeURIComponent(id)}`, {}, true);
  return photo?.urls?.raw && photo.user && photo.links ? mapUnsplash(photo, thumbWidth) : null;
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
