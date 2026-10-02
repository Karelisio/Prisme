import type { FeedSpec, SourceQuery } from '@/features/sources/feed';
import { UNKNOWN_COLOR } from '@/features/sources/filters';
import type { Wallpaper } from '@/features/sources/types';
import { keywordsOf } from './keywords';

/** Recherches d'un sujet sur les sources généralistes. */
export function subjectQueries(query: string): SourceQuery[] {
  return [
    { kind: 'unsplash-search', query },
    { kind: 'pexels-search', query },
    { kind: 'wallhaven', query, sorting: 'relevance' },
    { kind: 'pixabay', query, order: 'popular' },
  ];
}

/** « Plus comme ça », même sujet : fonds aux étiquettes proches (Wallhaven) ou recherche des mots-clés. */
export function similarSubjectSpec(w: Wallpaper): FeedSpec | null {
  if (w.source === 'wallhaven') {
    const id = w.id.slice('wallhaven:'.length);
    return { key: `similar:${w.id}`, queries: [{ kind: 'wallhaven', query: `like:${id}`, sorting: 'relevance' }] };
  }
  const keywords = keywordsOf(w);
  if (keywords.length === 0) return null;
  const query = keywords.join(' ');
  const queries: SourceQuery[] =
    w.source === 'art'
      ? [{ kind: 'art', query }]
      : w.source === 'nasa'
        ? [{ kind: 'nasa', query }, ...subjectQueries(query)]
        : subjectQueries(query);
  return { key: `similar:${w.id}`, searchQuery: query, queries };
}

/** « Plus comme ça », même couleur : fonds dont la teinte dominante est proche. */
export function similarColorSpec(w: Wallpaper): FeedSpec | null {
  const color = w.color.toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color) || color === UNKNOWN_COLOR) return null;
  const hex = color as `#${string}`;
  return {
    key: `similar-color:${hex}`,
    queries: [
      { kind: 'unsplash-search', query: 'wallpaper', color: hex },
      { kind: 'pexels-search', query: 'wallpaper', color: hex },
      { kind: 'wallhaven', sorting: 'toplist', color: hex },
      { kind: 'pixabay', query: 'wallpaper', order: 'popular', color: hex },
    ],
  };
}
