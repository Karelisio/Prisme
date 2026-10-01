import type { FeedSpec } from '@/features/sources/feed';

export interface Category extends FeedSpec {
  label: string;
}

const search = (key: string, label: string, query: string): Category => ({
  key,
  label,
  searchQuery: query,
  queries: [
    { kind: 'unsplash-search', query },
    { kind: 'pexels-search', query },
  ],
});

/** « À la une » met en avant le thème Wallpapers d'Unsplash, comme demandé. */
export const CATEGORIES: readonly Category[] = [
  {
    key: 'featured',
    label: 'À la une',
    searchQuery: 'wallpaper',
    queries: [{ kind: 'unsplash-topic', slug: 'wallpapers' }, { kind: 'pexels-curated' }],
  },
  {
    key: 'nature',
    label: 'Nature',
    searchQuery: 'nature landscape',
    queries: [
      { kind: 'unsplash-topic', slug: 'nature' },
      { kind: 'pexels-search', query: 'nature landscape' },
    ],
  },
  search('minimal', 'Minimal', 'minimal'),
  search('abstract', 'Abstrait', 'abstract'),
  search('dark', 'Sombre', 'dark aesthetic'),
  search('space', 'Espace', 'space galaxy'),
  {
    key: 'architecture',
    label: 'Architecture',
    searchQuery: 'architecture',
    queries: [
      { kind: 'unsplash-topic', slug: 'architecture-interior' },
      { kind: 'pexels-search', query: 'architecture' },
    ],
  },
  search('city', 'Villes', 'city night'),
  {
    key: 'textures',
    label: 'Textures',
    searchQuery: 'texture pattern',
    queries: [
      { kind: 'unsplash-topic', slug: 'textures-patterns' },
      { kind: 'pexels-search', query: 'texture pattern' },
    ],
  },
  {
    key: '3d',
    label: '3D',
    searchQuery: '3d render',
    queries: [
      { kind: 'unsplash-topic', slug: '3d-renders' },
      { kind: 'pexels-search', query: '3d render' },
    ],
  },
  search('ocean', 'Océan', 'ocean waves'),
  search('mountains', 'Montagnes', 'mountains'),
  search('flowers', 'Fleurs', 'flowers'),
  {
    key: 'animals',
    label: 'Animaux',
    searchQuery: 'animals',
    queries: [
      { kind: 'unsplash-topic', slug: 'animals' },
      { kind: 'pexels-search', query: 'animals wildlife' },
    ],
  },
  search('gradient', 'Dégradés', 'gradient'),
];

export function searchFeed(query: string): FeedSpec {
  return {
    key: `search:${query.toLowerCase()}`,
    searchQuery: query,
    queries: [
      { kind: 'unsplash-search', query },
      { kind: 'pexels-search', query },
    ],
  };
}
