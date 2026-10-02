import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR } from './filters';
import { ApiError, type SourcePage, type Wallpaper } from './types';

/** Médiathèque de la NASA : images du domaine public, sans clé. */
const API = 'https://images-api.nasa.gov/search';
const PER_PAGE = 100;

interface NasaLink {
  href: string;
  rel: string;
  render?: string;
  width?: number;
  height?: number;
}

export interface NasaItem {
  data: {
    nasa_id: string;
    title: string;
    media_type: string;
    center?: string;
    photographer?: string;
    secondary_creator?: string;
  }[];
  links?: NasaLink[];
}

interface SearchResponse {
  collection: {
    items: NasaItem[];
    links?: { rel: string; href: string }[];
  };
}

/** Variante d'un fichier de la médiathèque : « X~thumb.jpg » → « X~large.jpg ». */
const variant = (href: string, size: 'large' | 'orig') =>
  href.replace(/~(thumb|small|medium|large)\.(\w+)(\?[^#]*)?$/, (_, _from, ext: string, query = '') => `~${size}.${ext}${query}`);

/**
 * Image NASA → fond. Les dimensions viennent de l'original quand l'API les donne (lien
 * « canonical ») ; sinon elles valent 0 et l'aperçu les mesure.
 */
export function mapNasa(item: NasaItem): Wallpaper | null {
  const data = item.data[0];
  const links = (item.links ?? []).filter((l) => !l.render || l.render === 'image');
  const thumb = links.find((l) => l.rel === 'preview') ?? links[0];
  if (!data || data.media_type !== 'image' || !thumb) return null;
  const original = links.find((l) => l.rel === 'canonical');
  const large = links.find((l) => /~large\.\w+$/.test(l.href));
  const credit = data.secondary_creator || data.photographer || (data.center ? `NASA ${data.center}` : 'NASA');
  const page = `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id)}`;
  return {
    id: `nasa:${data.nasa_id}`,
    source: 'nasa',
    width: original?.width ?? 0,
    height: original?.height ?? 0,
    color: UNKNOWN_COLOR,
    alt: data.title,
    thumb: thumb.href,
    preview: large?.href ?? variant(thumb.href, 'large'),
    full: original?.href ?? variant(thumb.href, 'orig'),
    author: { name: credit, url: page },
    pageUrl: page,
  };
}

export async function nasaSearch(options: { query: string; page: number }): Promise<SourcePage> {
  const url = withParams(API, { q: options.query, media_type: 'image', page: options.page, page_size: PER_PAGE });
  let res;
  try {
    res = await getJson<SearchResponse>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('nasa', 'network', 'NASA injoignable');
    throw error;
  }
  if (res.status === 429) throw new ApiError('nasa', 'rate_limit', 'Trop de requêtes à la NASA, réessaie plus tard');
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.collection?.items)) {
    throw new ApiError('nasa', 'server', `Erreur NASA (${res.status})`);
  }
  const { items, links } = res.data.collection;
  const hasNext = links?.some((l) => l.rel === 'next') ?? false;
  return { items: items.map(mapNasa).filter((w): w is Wallpaper => w !== null), next: hasNext ? options.page + 1 : null };
}

/** Une image par son identifiant NASA (collection reçue) ; null si elle n'existe plus. */
export async function nasaAsset(id: string): Promise<Wallpaper | null> {
  const url = withParams(API, { nasa_id: id, media_type: 'image' });
  let res;
  try {
    res = await getJson<SearchResponse>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('nasa', 'network', 'NASA injoignable');
    throw error;
  }
  if (res.status === 404) return null;
  if (res.status === 429) throw new ApiError('nasa', 'rate_limit', 'Trop de requêtes à la NASA, réessaie plus tard');
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.collection?.items)) {
    throw new ApiError('nasa', 'server', `Erreur NASA (${res.status})`);
  }
  const item = res.data.collection.items.find((i) => i.data?.[0]?.nasa_id === id);
  return item ? mapNasa(item) : null;
}
