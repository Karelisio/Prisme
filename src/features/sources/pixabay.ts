import { env } from '@/shared/config/env';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR, pixabayColor } from './filters';
import { ApiError, type ColorChoice, type SourcePage, type Wallpaper } from './types';

const API = 'https://pixabay.com/api/';
const PER_PAGE = 40;
/** Clé gratuite : l'image la plus grande servie fait 1280 px de côté. */
export const PIXABAY_MAX_SIDE = 1280;

export interface PixabayHit {
  id: number;
  pageURL: string;
  tags: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
}

interface SearchResponse {
  totalHits: number;
  hits: PixabayHit[];
}

/** Dimensions de `largeImageURL` : l'original ramené à 1280 px sur son plus grand côté. */
export function largeSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PIXABAY_MAX_SIDE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function mapPixabay(hit: PixabayHit): Wallpaper {
  const size = largeSize(hit.imageWidth, hit.imageHeight);
  return {
    id: `pixabay:${hit.id}`,
    source: 'pixabay',
    ...size,
    color: UNKNOWN_COLOR,
    alt: hit.tags || 'Image Pixabay',
    // « _640 » → « _340 » : miniature de 340 px de haut, servie par le CDN Pixabay.
    thumb: hit.webformatURL.replace('_640', '_340'),
    preview: hit.largeImageURL,
    full: hit.largeImageURL,
    author: { name: hit.user, url: `https://pixabay.com/users/${encodeURIComponent(hit.user)}-${hit.user_id}/` },
    pageUrl: hit.pageURL,
  };
}

export async function pixabaySearch(options: {
  query: string;
  page: number;
  order: 'popular' | 'latest';
  color: ColorChoice | null;
}): Promise<SourcePage> {
  if (!env.pixabayKey) throw new ApiError('pixabay', 'missing_key', 'Clé Pixabay manquante');
  const url = withParams(API, {
    key: env.pixabayKey,
    q: options.query || undefined,
    lang: 'fr',
    image_type: 'photo',
    orientation: 'vertical',
    min_width: 1080,
    min_height: 1920,
    safesearch: 'true',
    order: options.order,
    colors: options.color ? (pixabayColor(options.color) ?? undefined) : undefined,
    page: options.page,
    per_page: PER_PAGE,
  });
  let res;
  try {
    res = await getJson<SearchResponse>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('pixabay', 'network', 'Pixabay injoignable');
    throw error;
  }
  if (res.status === 429) throw new ApiError('pixabay', 'rate_limit', 'Limite de requêtes Pixabay atteinte, réessaie plus tard');
  if (res.status === 400 && /key/i.test(JSON.stringify(res.data))) throw new ApiError('pixabay', 'auth', 'Clé Pixabay refusée');
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.hits)) {
    throw new ApiError('pixabay', 'server', `Erreur Pixabay (${res.status})`);
  }
  const { hits, totalHits } = res.data;
  return { items: hits.map(mapPixabay), next: options.page * PER_PAGE < Math.min(totalHits, 500) ? options.page + 1 : null };
}
