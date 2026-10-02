import type { FeedSpec, SourceQuery } from '@/features/sources/feed';
import { UNKNOWN_COLOR, classifyColor } from '@/features/sources/filters';
import type { ColorFilter, Wallpaper } from '@/features/sources/types';
import { keywordsOf, topWords } from './keywords';
import { subjectQueries } from './similar';
import type { Photographer } from './store';

/** Nombre de favoris à partir duquel « Pour toi » propose des suggestions. */
export const MIN_FAVORITES = 3;

/** Goûts déduits des favoris, entièrement sur le téléphone. */
export interface TasteProfile {
  keywords: string[];
  color: ColorFilter | null;
  photographers: Photographer[];
  favorites: number;
}

export function buildProfile(favorites: Wallpaper[]): TasteProfile {
  const keywords = topWords(
    favorites.map((w) => keywordsOf(w, 6)),
    3,
    favorites.length >= 6 ? 2 : 1,
  );

  // Teinte dominante : seulement si elle revient dans au moins 40 % des favoris colorés.
  const colors = favorites
    .filter((w) => w.color.toLowerCase() !== UNKNOWN_COLOR)
    .map((w) => classifyColor(w.color)[0])
    .filter((c): c is ColorFilter => !!c);
  const counts = new Map<ColorFilter, number>();
  for (const c of colors) counts.set(c, (counts.get(c) ?? 0) + 1);
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const color = top && colors.length >= MIN_FAVORITES && top[1] / colors.length >= 0.4 ? top[0] : null;

  // Photographes Unsplash présents au moins deux fois.
  const byUser = new Map<string, { p: Photographer; n: number }>();
  for (const w of favorites) {
    const username = w.source === 'unsplash' ? w.author?.username : undefined;
    if (!username || !w.author) continue;
    const entry = byUser.get(username) ?? { p: { username, name: w.author.name, url: w.author.url }, n: 0 };
    entry.n++;
    byUser.set(username, entry);
  }
  const photographers = [...byUser.values()]
    .filter((e) => e.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((e) => e.p);

  return { keywords, color, photographers, favorites: favorites.length };
}

/** Flux « Pour toi » : sujets favoris, photographes préférés et teinte dominante. */
export function forYouSpec(profile: TasteProfile): FeedSpec | null {
  if (profile.favorites < MIN_FAVORITES) return null;
  const queries: SourceQuery[] = [
    ...profile.keywords.flatMap(subjectQueries),
    ...profile.photographers.map((p): SourceQuery => ({ kind: 'unsplash-user', username: p.username })),
  ];
  if (profile.color) {
    queries.push({ kind: 'unsplash-search', query: 'wallpaper', color: profile.color }, { kind: 'wallhaven', sorting: 'toplist', color: profile.color });
  }
  if (queries.length === 0) return null;
  const key = ['foryou', profile.keywords.join(','), profile.photographers.map((p) => p.username).join(','), profile.color ?? ''].join('|');
  return { key, queries };
}
