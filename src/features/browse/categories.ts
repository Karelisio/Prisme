import type { FeedSpec, SourceQuery } from '@/features/sources/feed';
import type { WallhavenCategories } from '@/features/sources/wallhaven';

export interface Category extends FeedSpec {
  label: string;
}

/** Requêtes d'un thème : recherche sur chaque source généraliste (Wallhaven : les plus aimés). */
function themed(query: string, extra: { wallhaven?: string; categories?: WallhavenCategories } = {}): SourceQuery[] {
  return [
    { kind: 'unsplash-search', query },
    { kind: 'pexels-search', query },
    { kind: 'wallhaven', query: extra.wallhaven ?? query, sorting: 'favorites', categories: extra.categories ?? '100' },
    { kind: 'pixabay', query, order: 'popular' },
  ];
}

const search = (key: string, label: string, query: string, wallhaven?: string): Category => ({
  key,
  label,
  searchQuery: query,
  queries: themed(query, { wallhaven }),
});

/** Thème Unsplash en tête, puis les autres sources sur le même sujet. */
const topic = (key: string, label: string, slug: string, query: string): Category => {
  const [, ...others] = themed(query);
  return { key, label, searchQuery: query, queries: [{ kind: 'unsplash-topic', slug }, ...others] };
};

/** « À la une » met en avant le thème Wallpapers d'Unsplash, comme demandé. */
export const CATEGORIES: readonly Category[] = [
  {
    key: 'featured',
    label: 'À la une',
    searchQuery: 'wallpaper',
    queries: [{ kind: 'unsplash-topic', slug: 'wallpapers' }, { kind: 'pexels-curated' }, { kind: 'wallhaven', sorting: 'toplist', categories: '100' }],
  },
  {
    key: 'trending',
    label: 'Tendances',
    searchQuery: 'wallpaper',
    queries: [
      { kind: 'unsplash-topic', slug: 'wallpapers', order: 'popular' },
      { kind: 'wallhaven', sorting: 'toplist' },
      { kind: 'pexels-curated' },
      { kind: 'pixabay', order: 'popular' },
    ],
  },
  {
    key: 'latest',
    label: 'Nouveautés',
    searchQuery: 'wallpaper',
    queries: [
      { kind: 'unsplash-topic', slug: 'wallpapers', order: 'latest' },
      { kind: 'wallhaven', sorting: 'date_added', categories: '100' },
      { kind: 'pixabay', order: 'latest' },
    ],
  },
  topic('nature', 'Nature', 'nature', 'nature landscape'),
  search('minimal', 'Minimal', 'minimal', 'minimalism'),
  search('abstract', 'Abstrait', 'abstract'),
  search('dark', 'Sombre', 'dark aesthetic', 'dark'),
  {
    key: 'space',
    label: 'Espace',
    searchQuery: 'space galaxy',
    queries: [
      { kind: 'nasa', query: 'nebula' },
      ...themed('space galaxy', { wallhaven: 'space' }),
      { kind: 'nasa', query: 'galaxy' },
      { kind: 'nasa', query: 'earth from space' },
    ],
  },
  {
    key: 'art',
    label: 'Art',
    searchQuery: 'painting',
    queries: [{ kind: 'art' }, { kind: 'wallhaven', query: 'painting', sorting: 'favorites', categories: '100' }],
  },
  topic('architecture', 'Architecture', 'architecture-interior', 'architecture'),
  search('city', 'Villes', 'city night', 'city'),
  topic('textures', 'Textures', 'textures-patterns', 'texture pattern'),
  topic('3d', '3D', '3d-renders', '3d render'),
  search('ocean', 'Océan', 'ocean waves', 'sea'),
  search('mountains', 'Montagnes', 'mountains'),
  search('flowers', 'Fleurs', 'flowers'),
  topic('animals', 'Animaux', 'animals', 'animals wildlife'),
  search('gradient', 'Dégradés', 'gradient'),
  {
    key: 'anime',
    label: 'Anime',
    queries: [{ kind: 'wallhaven', sorting: 'favorites', categories: '010' }],
  },
  {
    key: 'games',
    label: 'Jeux vidéo',
    searchQuery: 'video games',
    queries: [{ kind: 'wallhaven', query: 'video games', sorting: 'favorites', categories: '110' }],
  },
];

export function searchFeed(query: string): FeedSpec {
  return {
    key: `search:${query.toLowerCase()}`,
    searchQuery: query,
    queries: [
      { kind: 'unsplash-search', query },
      { kind: 'pexels-search', query },
      { kind: 'wallhaven', query, sorting: 'relevance' },
      { kind: 'pixabay', query, order: 'popular' },
      { kind: 'art', query },
      { kind: 'nasa', query },
    ],
  };
}
