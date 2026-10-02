import { t } from '@/shared/i18n';
import { NetworkError, getJson, withParams } from '@/shared/lib/http';
import { UNKNOWN_COLOR } from './filters';
import { ApiError, type SourcePage, type Wallpaper } from './types';

/** Open Access du Cleveland Museum of Art : œuvres du domaine public (CC0), sans clé. */
const API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const PER_PAGE = 100;

interface ClevelandImage {
  url: string;
  /** L'API renvoie parfois les dimensions sous forme de texte. */
  width: number | string;
  height: number | string;
}

export interface ClevelandArtwork {
  id: number;
  title: string;
  creation_date?: string | null;
  url: string;
  creators?: { description: string }[] | null;
  images?: { web?: ClevelandImage | null; print?: ClevelandImage | null } | null;
}

interface SearchResponse {
  info?: { total?: number };
  data: ClevelandArtwork[];
}

/** « Claude Monet (French, 1840–1926) » → « Claude Monet ». */
export function creatorName(description: string): string {
  return description.replace(/\s*\(.*$/s, '').trim();
}

/** Œuvre → fond : miniature « web » (~900 px), image « print » (~3400 px) pour l'aperçu et l'application. */
export function mapArtwork(a: ClevelandArtwork): Wallpaper | null {
  const web = a.images?.web;
  const print = a.images?.print ?? web;
  const width = Number(print?.width);
  const height = Number(print?.height);
  if (!web?.url || !print?.url || !width || !height) return null;
  const creator = a.creators?.[0]?.description;
  const name = creator ? creatorName(creator) : '';
  return {
    id: `art:${a.id}`,
    source: 'art',
    width,
    height,
    color: UNKNOWN_COLOR,
    alt: a.creation_date ? `${a.title} (${a.creation_date})` : a.title,
    thumb: web.url,
    preview: print.url,
    full: print.url,
    ...(name && { author: { name, url: a.url } }),
    pageUrl: a.url,
  };
}

/** Peintures du domaine public, filtrées par mot-clé si `query` est fourni. */
export async function artSearch(options: { query?: string; page: number }): Promise<SourcePage> {
  const skip = (options.page - 1) * PER_PAGE;
  const url = withParams(API, {
    q: options.query || undefined,
    type: 'Painting',
    has_image: 1,
    cc0: 1,
    limit: PER_PAGE,
    skip,
    fields: 'id,title,creation_date,url,creators,images',
  });
  let res;
  try {
    res = await getJson<SearchResponse>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('art', 'network', t('Musée injoignable'));
    throw error;
  }
  if (res.status === 429) throw new ApiError('art', 'rate_limit', t('Trop de requêtes au musée, réessaie plus tard'));
  if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
    throw new ApiError('art', 'server', t('Erreur du musée ({status})', { status: res.status }));
  }
  const { data, info } = res.data;
  const items = data.map(mapArtwork).filter((w): w is Wallpaper => w !== null);
  const more = data.length === PER_PAGE && (info?.total === undefined || skip + data.length < info.total);
  return { items, next: more ? options.page + 1 : null };
}

/** Une œuvre par son identifiant (collection reçue) ; null si elle n'existe plus ou n'a pas d'image. */
export async function artArtwork(id: string): Promise<Wallpaper | null> {
  const url = withParams(`${API}${encodeURIComponent(id)}`, { fields: 'id,title,creation_date,url,creators,images' });
  let res;
  try {
    res = await getJson<{ data?: ClevelandArtwork | ClevelandArtwork[] } & Partial<ClevelandArtwork>>(url);
  } catch (error) {
    if (error instanceof NetworkError) throw new ApiError('art', 'network', t('Musée injoignable'));
    throw error;
  }
  if (res.status === 404) return null;
  if (res.status === 429) throw new ApiError('art', 'rate_limit', t('Trop de requêtes au musée, réessaie plus tard'));
  if (res.status < 200 || res.status >= 300 || !res.data || typeof res.data !== 'object') {
    throw new ApiError('art', 'server', t('Erreur du musée ({status})', { status: res.status }));
  }
  // Selon le point d'accès, l'œuvre est enveloppée dans « data » ou renvoyée telle quelle.
  const { data } = res.data;
  const artwork = Array.isArray(data) ? data[0] : (data ?? (res.data.id === undefined ? undefined : (res.data as ClevelandArtwork)));
  return artwork && String(artwork.id) === id ? mapArtwork(artwork) : null;
}
