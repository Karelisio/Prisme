import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSettings } from '@/features/settings/store';
import { type FeedSpec, dedupe, fetchFeedPage, resolveQueries } from '@/features/sources/feed';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { useBrowse } from './store';

/** Largeur des miniatures : basse résolution, arrondie par paliers pour profiter du cache HTTP. */
export function thumbWidthFor(columns: number, dataSaver: boolean, viewportWidth = window.innerWidth): number {
  const density = Math.min(window.devicePixelRatio || 1, dataSaver ? 1.25 : 2);
  const width = Math.ceil(viewportWidth / columns) * density;
  return Math.min(600, Math.max(160, Math.ceil(width / 40) * 40));
}

export function useFeed(spec: FeedSpec | null) {
  const filters = useBrowse((s) => s.filters);
  const sources = useSettings((s) => s.sources);
  const columns = useSettings((s) => s.gridColumns);
  const dataSaver = useSettings((s) => s.dataSaver);
  const screen = useScreenInfo();
  const ratio = screenRatio(screen);
  const thumbWidth = thumbWidthFor(columns, dataSaver);
  const queries = useMemo(() => (spec ? resolveQueries(spec, { filters, sources }) : []), [spec, filters, sources]);

  const query = useInfiniteQuery({
    queryKey: ['feed', spec?.key ?? null, filters, sources, thumbWidth, filters.ratio === 'screen' ? ratio.toFixed(2) : null],
    enabled: !!spec && queries.length > 0,
    initialPageParam: queries.map((): number | null => 1),
    queryFn: ({ pageParam }) => fetchFeedPage(queries, pageParam, { filters, screenRatio: ratio, thumbWidth, sources }),
    getNextPageParam: (last) => (last.cursors.some((c) => c != null) ? last.cursors : undefined),
    maxPages: 12,
  });

  const items = useMemo(() => dedupe(query.data?.pages.flatMap((p) => p.items) ?? []), [query.data]);
  const errors = query.data?.pages[query.data.pages.length - 1]?.errors ?? [];
  return { ...query, items, errors, noSources: !!spec && queries.length === 0 };
}
