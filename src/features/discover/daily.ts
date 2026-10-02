import { type FeedSpec, fetchFeedPage, resolveQueries } from '@/features/sources/feed';
import type { SourceToggles } from '@/features/sources/registry';
import { DEFAULT_FILTERS, type Wallpaper } from '@/features/sources/types';
import { isHidden } from './hidden';
import { useDiscover } from './store';

/** Sélection d'où sort le fond du jour : les plus populaires du moment. */
export const DAILY_SPEC: FeedSpec = {
  key: 'daily',
  queries: [
    { kind: 'unsplash-topic', slug: 'wallpapers', order: 'popular' },
    { kind: 'wallhaven', sorting: 'toplist', categories: '100' },
    { kind: 'pexels-curated' },
    { kind: 'nasa', query: 'nebula' },
  ],
};

/** Jour local « AAAA-MM-JJ ». */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Choix stable pour un jour donné (même liste, même jour → même fond). */
export function pickOfTheDay<T>(items: T[], day: string): T | null {
  if (items.length === 0) return null;
  let hash = 2166136261;
  for (const char of day) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return items[(hash >>> 0) % items.length] ?? null;
}

/** Fond du jour mémorisé, sinon choisi parmi les populaires (hors fonds masqués) et mémorisé. */
export async function loadDaily(day: string, sources: SourceToggles, thumbWidth: number): Promise<Wallpaper | null> {
  const saved = useDiscover.getState().daily;
  if (saved?.day === day) return saved.wallpaper;
  const queries = resolveQueries(DAILY_SPEC, { filters: DEFAULT_FILTERS, sources });
  if (queries.length === 0) return null;
  const page = await fetchFeedPage(
    queries,
    queries.map(() => 1),
    { filters: DEFAULT_FILTERS, screenRatio: 20 / 9, thumbWidth, sources },
  );
  const hidden = useDiscover.getState();
  const pick = pickOfTheDay(
    page.items.filter((w) => !isHidden(w, hidden)),
    day,
  );
  if (pick) useDiscover.getState().setDaily({ day, wallpaper: pick });
  return pick;
}
