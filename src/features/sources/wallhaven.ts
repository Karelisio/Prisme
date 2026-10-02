import { t } from '@/shared/i18n';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR, wallhavenColor } from './filters';
import { ApiError, type ColorChoice, type SourcePage, type Wallpaper } from './types';

const API = 'https://wallhaven.cc/api/v1';

export type WallhavenSorting = 'toplist' | 'date_added' | 'relevance' | 'favorites';

/** Catégories Wallhaven (général, anime, personnes) sous forme de 3 bits : « 111 » = toutes. */
export type WallhavenCategories = '111' | '100' | '010' | '110';

export interface WallhavenWallpaper {
  id: string;
  url: string;
  dimension_x: number;
  dimension_y: number;
  colors: string[];
  path: string;
  thumbs: { original: string; large: string; small: string };
  category?: string;
}

interface SearchResponse {
  data: WallhavenWallpaper[];
  meta: { current_page: number; last_page: number };
}

/** Wallhaven ne redimensionne pas : la miniature « originale » garde le format, l'aperçu est l'image HD. */
export function mapWallhaven(w: WallhavenWallpaper): Wallpaper {
  return {
    id: `wallhaven:${w.id}`,
    source: 'wallhaven',
    width: w.dimension_x,
    height: w.dimension_y,
    color: w.colors[0] ?? UNKNOWN_COLOR,
    alt: t('Fond Wallhaven {id}', { id: w.id }),
    thumb: w.thumbs.original,
    preview: w.path,
    full: w.path,
    pageUrl: w.url,
  };
}

/**
 * Recherche Wallhaven, contenu tout public uniquement (sans clé, l'API ne renvoie rien d'autre),
 * formats portrait d'au moins 1080 × 1920.
 */
export async function wallhavenSearch(options: {
  query?: string;
  sorting: WallhavenSorting;
  categories?: WallhavenCategories;
  page: number;
  color: ColorChoice | null;
}): Promise<SourcePage> {
  const url = withParams(`${API}/search`, {
    q: options.query || undefined,
    categories: options.categories ?? '111',
    purity: '100',
    ratios: 'portrait',
    atleast: '1080x1920',
    sorting: options.sorting,
    order: 'desc',
    topRange: options.sorting === 'toplist' ? '1M' : undefined,
    colors: options.color ? (wallhavenColor(options.color) ?? undefined) : undefined,
    page: options.page,
  });
  let res;
  try {
    res = await getJson<SearchResponse>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('wallhaven', 'network', t('Wallhaven injoignable'));
    throw error;
  }
  if (res.status === 429) throw new ApiError('wallhaven', 'rate_limit', t('Trop de requêtes Wallhaven, réessaie dans une minute'));
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
    throw new ApiError('wallhaven', 'server', t('Erreur Wallhaven ({status})', { status: res.status }));
  }
  const { data, meta } = res.data;
  return { items: data.map(mapWallhaven), next: meta && meta.current_page < meta.last_page ? options.page + 1 : null };
}

/**
 * Un fond par son identifiant (collection reçue) ; null s'il n'existe plus ou n'est pas tout
 * public (sans clé, l'API répond 401 pour ces contenus).
 */
export async function wallhavenWallpaper(id: string): Promise<Wallpaper | null> {
  let res;
  try {
    res = await getJson<{ data?: WallhavenWallpaper & { purity?: string } }>(`${API}/w/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('wallhaven', 'network', t('Wallhaven injoignable'));
    throw error;
  }
  if (res.status === 404 || res.status === 401) return null;
  if (res.status === 429) throw new ApiError('wallhaven', 'rate_limit', t('Trop de requêtes Wallhaven, réessaie dans une minute'));
  if (res.status < 200 || res.status >= 300) throw new ApiError('wallhaven', 'server', t('Erreur Wallhaven ({status})', { status: res.status }));
  const wallpaper = res.data?.data;
  if (!wallpaper?.path || !wallpaper.thumbs || !Array.isArray(wallpaper.colors)) return null;
  // L'app ne montre que du contenu tout public : un code de collection n'y change rien.
  if (wallpaper.purity && wallpaper.purity !== 'sfw') return null;
  return mapWallhaven(wallpaper);
}
