import { artSearch } from './art';
import { fitsWallpaper, matchesAmoled, matchesColor, matchesRatio, pexelsColor, pixabayColor, unsplashColor, wallhavenColor } from './filters';
import { nasaSearch } from './nasa';
import { pexelsCollection, pexelsCurated, pexelsSearch } from './pexels';
import { pixabaySearch } from './pixabay';
import type { SourceToggles } from './registry';
import { ApiError, type ColorChoice, type Filters, type RemoteSource, type SourcePage, type Wallpaper } from './types';
import { type UnsplashOrder, unsplashCollection, unsplashSearch, unsplashTopic, unsplashUser } from './unsplash';
import { type WallhavenCategories, type WallhavenSorting, wallhavenSearch } from './wallhaven';

/** Une requête vers une source ; une page de flux interroge toutes les requêtes en parallèle. */
export type SourceQuery =
  | { kind: 'unsplash-topic'; slug: string; order?: UnsplashOrder }
  | { kind: 'unsplash-search'; query: string; color?: ColorChoice; order?: 'latest' | 'relevant' }
  | { kind: 'unsplash-collection'; id: string }
  | { kind: 'unsplash-user'; username: string }
  | { kind: 'pexels-curated' }
  | { kind: 'pexels-search'; query: string; color?: ColorChoice }
  | { kind: 'pexels-collection'; id: string }
  | { kind: 'wallhaven'; query?: string; sorting: WallhavenSorting; categories?: WallhavenCategories; color?: ColorChoice }
  | { kind: 'pixabay'; query?: string; order: 'popular' | 'latest'; color?: ColorChoice }
  | { kind: 'art'; query?: string }
  | { kind: 'nasa'; query: string }
  | { kind: 'static'; items: Wallpaper[] };

export interface FeedSpec {
  key: string;
  queries: SourceQuery[];
  /** Recherche utilisée quand un filtre de couleur impose de passer par l'API de recherche. */
  searchQuery?: string;
}

export interface FeedContext {
  filters: Filters;
  screenRatio: number;
  thumbWidth: number;
  sources: SourceToggles;
}

export interface FeedPage {
  items: Wallpaper[];
  /** Page suivante par requête (même ordre que les requêtes résolues), null = épuisée. */
  cursors: (number | null)[];
  errors: ApiError[];
}

const STATIC_PAGE_SIZE = 30;

export function sourceOf(query: SourceQuery): RemoteSource | 'static' {
  if (query.kind === 'static') return 'static';
  if (query.kind.startsWith('unsplash')) return 'unsplash';
  if (query.kind.startsWith('pexels')) return 'pexels';
  return query.kind as RemoteSource;
}

/** Couleur demandée aux serveurs : noir pour le filtre AMOLED, sinon la couleur choisie. */
const wantedColor = (filters: Filters): ColorChoice | null => (filters.amoled ? 'black' : filters.color);

/**
 * Adapte les requêtes aux filtres et aux sources utilisables. Avec un filtre de couleur, les flux
 * « thème » et « sélection » passent par la recherche, seule à filtrer par couleur côté serveur.
 */
export function resolveQueries(spec: FeedSpec, ctx: Pick<FeedContext, 'filters' | 'sources'>): SourceQuery[] {
  const color = wantedColor(ctx.filters);
  return spec.queries
    .filter((q) => {
      const source = sourceOf(q);
      return source === 'static' || ctx.sources[source];
    })
    .map((q): SourceQuery => {
      if (!color || !spec.searchQuery) return q;
      if (q.kind === 'unsplash-topic') {
        return { kind: 'unsplash-search', query: spec.searchQuery, ...(q.order === 'latest' && { order: 'latest' as const }) };
      }
      if (q.kind === 'pexels-curated') return { kind: 'pexels-search', query: spec.searchQuery };
      return q;
    });
}

/** Couleur filtrée par le serveur pour cette requête (filtres de l'utilisateur prioritaires), null sinon. */
export function serverColor(query: SourceQuery, filters: Filters): ColorChoice | null {
  const wanted = wantedColor(filters) ?? ('color' in query ? query.color : undefined) ?? null;
  if (!wanted) return null;
  switch (query.kind) {
    case 'unsplash-search':
      return unsplashColor(wanted) ? wanted : null;
    case 'pexels-search':
      return pexelsColor(wanted) ? wanted : null;
    case 'wallhaven':
      return wallhavenColor(wanted) ? wanted : null;
    case 'pixabay':
      return pixabayColor(wanted) ? wanted : null;
    default:
      return null;
  }
}

async function fetchQuery(query: SourceQuery, page: number, ctx: FeedContext): Promise<SourcePage> {
  const color = serverColor(query, ctx.filters);
  switch (query.kind) {
    case 'unsplash-topic':
      return unsplashTopic(query.slug, page, ctx.thumbWidth, query.order);
    case 'unsplash-search':
      return unsplashSearch(query.query, page, ctx.thumbWidth, color, query.order);
    case 'unsplash-collection':
      return unsplashCollection(query.id, page, ctx.thumbWidth);
    case 'unsplash-user':
      return unsplashUser(query.username, page, ctx.thumbWidth);
    case 'pexels-curated':
      return pexelsCurated(page, ctx.thumbWidth);
    case 'pexels-search':
      return pexelsSearch(query.query, page, ctx.thumbWidth, color);
    case 'pexels-collection':
      return pexelsCollection(query.id, page, ctx.thumbWidth);
    case 'wallhaven':
      return wallhavenSearch({ query: query.query, sorting: query.sorting, categories: query.categories, page, color });
    case 'pixabay':
      return pixabaySearch({ query: query.query ?? '', order: query.order, page, color });
    case 'art':
      return artSearch({ query: query.query, page });
    case 'nasa':
      return nasaSearch({ query: query.query, page });
    case 'static': {
      const start = (page - 1) * STATIC_PAGE_SIZE;
      const items = query.items.slice(start, start + STATIC_PAGE_SIZE);
      return { items, next: start + STATIC_PAGE_SIZE < query.items.length ? page + 1 : null };
    }
  }
}

/** Alterne les résultats des sources : a1, b1, a2, b2… */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item !== undefined) out.push(item);
    }
  }
  return out;
}

/** Charge une page : requêtes en parallèle, une source en échec n'empêche pas les autres. */
export async function fetchFeedPage(queries: SourceQuery[], cursors: (number | null)[], ctx: FeedContext): Promise<FeedPage> {
  const results = await Promise.allSettled(
    queries.map((query, i) => {
      const page = cursors[i];
      return page == null ? Promise.resolve<SourcePage>({ items: [], next: null }) : fetchQuery(query, page, ctx);
    }),
  );

  const errors: ApiError[] = [];
  const lists: Wallpaper[][] = [];
  const next: (number | null)[] = [];
  results.forEach((result, i) => {
    const query = queries[i] as SourceQuery;
    if (result.status === 'fulfilled') {
      const remote = query.kind !== 'static';
      // Filtrage local : format pour les sources distantes, ratio, AMOLED, et couleur quand le serveur ne l'a pas fait.
      const server = serverColor(query, ctx.filters);
      const needsColorCheck = ctx.filters.color !== null && !ctx.filters.amoled && server === null;
      lists.push(
        result.value.items.filter(
          (w) =>
            (!remote || fitsWallpaper(w)) &&
            matchesRatio(w, ctx.filters.ratio, ctx.screenRatio) &&
            (!needsColorCheck || matchesColor(w, ctx.filters.color)) &&
            (!ctx.filters.amoled || matchesAmoled(w, server !== null)),
        ),
      );
      next.push(result.value.next);
    } else {
      const reason = result.reason;
      const source = sourceOf(query);
      errors.push(reason instanceof ApiError ? reason : new ApiError(source === 'static' ? 'packs' : source, 'server', String(reason)));
      lists.push([]);
      // Une source sans clé ou bloquée n'est pas réessayée pour les pages suivantes.
      const fatal = reason instanceof ApiError && (reason.kind === 'missing_key' || reason.kind === 'auth');
      next.push(fatal ? null : (cursors[i] ?? null));
    }
  });

  const allFailed = errors.length > 0 && errors.length === queries.filter((_, i) => cursors[i] != null).length;
  if (allFailed && errors[0]) throw errors[0];

  // Si toutes les requêtes ont échoué pour des raisons non fatales, on évite de boucler sur la même page.
  const progressed = next.some((c, i) => c !== cursors[i]);
  return { items: dedupe(interleave(lists)), cursors: progressed ? next : next.map(() => null), errors };
}

export function dedupe(items: Wallpaper[]): Wallpaper[] {
  const seen = new Set<string>();
  return items.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}
