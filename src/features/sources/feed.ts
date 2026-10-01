import { isHighResPortrait, matchesColor, matchesRatio, pexelsColor, unsplashColor } from './filters';
import { pexelsCollection, pexelsCurated, pexelsSearch } from './pexels';
import { ApiError, type ColorFilter, type Filters, type SourcePage, type Wallpaper } from './types';
import { unsplashCollection, unsplashSearch, unsplashTopic } from './unsplash';

/** Une requête vers une source ; une page de flux interroge toutes les requêtes en parallèle. */
export type SourceQuery =
  | { kind: 'unsplash-topic'; slug: string }
  | { kind: 'unsplash-search'; query: string; color?: ColorFilter }
  | { kind: 'unsplash-collection'; id: string }
  | { kind: 'pexels-curated' }
  | { kind: 'pexels-search'; query: string; color?: ColorFilter }
  | { kind: 'pexels-collection'; id: string }
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
  sources: { unsplash: boolean; pexels: boolean };
}

export interface FeedPage {
  items: Wallpaper[];
  /** Page suivante par requête (même ordre que les requêtes résolues), null = épuisée. */
  cursors: (number | null)[];
  errors: ApiError[];
}

const STATIC_PAGE_SIZE = 30;

function sourceOf(query: SourceQuery): 'unsplash' | 'pexels' | 'static' {
  if (query.kind === 'static') return 'static';
  return query.kind.startsWith('unsplash') ? 'unsplash' : 'pexels';
}

/**
 * Adapte les requêtes aux filtres et aux sources activées. Avec un filtre de couleur, les flux
 * « thème » et « sélection » passent par la recherche, seule à filtrer par couleur côté serveur.
 */
export function resolveQueries(spec: FeedSpec, ctx: Pick<FeedContext, 'filters' | 'sources'>): SourceQuery[] {
  const color = ctx.filters.color;
  return spec.queries
    .filter((q) => {
      const source = sourceOf(q);
      return source === 'static' || ctx.sources[source];
    })
    .map((q): SourceQuery => {
      if (!color || !spec.searchQuery) return q;
      if (q.kind === 'unsplash-topic') return { kind: 'unsplash-search', query: spec.searchQuery };
      if (q.kind === 'pexels-curated') return { kind: 'pexels-search', query: spec.searchQuery };
      return q;
    });
}

/** Couleur demandée au serveur pour cette requête (filtre utilisateur prioritaire), null sinon. */
function serverColor(query: SourceQuery, filter: ColorFilter | null): ColorFilter | null {
  if (query.kind !== 'unsplash-search' && query.kind !== 'pexels-search') return null;
  const wanted = filter ?? query.color ?? null;
  if (!wanted) return null;
  const supported = query.kind === 'unsplash-search' ? unsplashColor(wanted) : pexelsColor(wanted);
  return supported ? wanted : null;
}

async function fetchQuery(query: SourceQuery, page: number, ctx: FeedContext): Promise<SourcePage> {
  const color = serverColor(query, ctx.filters.color);
  switch (query.kind) {
    case 'unsplash-topic':
      return unsplashTopic(query.slug, page, ctx.thumbWidth);
    case 'unsplash-search':
      return unsplashSearch(query.query, page, ctx.thumbWidth, color);
    case 'unsplash-collection':
      return unsplashCollection(query.id, page, ctx.thumbWidth);
    case 'pexels-curated':
      return pexelsCurated(page, ctx.thumbWidth);
    case 'pexels-search':
      return pexelsSearch(query.query, page, ctx.thumbWidth, color);
    case 'pexels-collection':
      return pexelsCollection(query.id, page, ctx.thumbWidth);
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
      // Filtrage local : portrait HD pour les sources distantes, ratio, et couleur quand le serveur ne l'a pas fait.
      const needsColorCheck = ctx.filters.color !== null && serverColor(query, ctx.filters.color) === null;
      lists.push(
        result.value.items.filter(
          (w) =>
            (!remote || isHighResPortrait(w)) &&
            matchesRatio(w, ctx.filters.ratio, ctx.screenRatio) &&
            (!needsColorCheck || matchesColor(w, ctx.filters.color)),
        ),
      );
      next.push(result.value.next);
    } else {
      const reason = result.reason;
      errors.push(reason instanceof ApiError ? reason : new ApiError(sourceOf(query) === 'pexels' ? 'pexels' : 'unsplash', 'server', String(reason)));
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
