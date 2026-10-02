import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isHidden } from '@/features/discover/hidden';
import { useDiscover } from '@/features/discover/store';
import { useSettings } from '@/features/settings/store';
import { type FeedSpec, dedupe, fetchFeedPage, resolveQueries } from '@/features/sources/feed';
import { usableSources } from '@/features/sources/registry';
import type { Filters, Wallpaper } from '@/features/sources/types';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { GRID_MARGIN, columnCount } from './mosaic';
import { useBrowse } from './store';

/** Largeur des miniatures : basse résolution, arrondie par paliers pour profiter du cache HTTP. */
export function thumbWidthFor(columns: number, dataSaver: boolean, viewportWidth = window.innerWidth): number {
  const density = Math.min(window.devicePixelRatio || 1, dataSaver ? 1.25 : 2);
  const width = Math.ceil(viewportWidth / columns) * density;
  return Math.min(600, Math.max(160, Math.ceil(width / 40) * 40));
}

export interface FeedOptions {
  /** Filtres propres à cet écran (sinon ceux de l'Explorer). */
  filters?: Filters;
  /** Fonds à écarter en plus des contenus masqués (ex. favoris déjà connus). */
  exclude?: (w: Wallpaper) => boolean;
}

export function useFeed(spec: FeedSpec | null, options: FeedOptions = {}) {
  const browseFilters = useBrowse((s) => s.filters);
  const filters = options.filters ?? browseFilters;
  const enabled = useSettings((s) => s.sources);
  const sources = useMemo(() => usableSources(enabled), [enabled]);
  const layout = useSettings((s) => s.gridLayout);
  const dataSaver = useSettings((s) => s.dataSaver);
  const hiddenIds = useDiscover((s) => s.hiddenIds);
  const hiddenAuthors = useDiscover((s) => s.hiddenAuthors);
  const hiddenWords = useDiscover((s) => s.hiddenWords);
  const screen = useScreenInfo();
  const ratio = screenRatio(screen);
  const thumbWidth = thumbWidthFor(columnCount(layout, window.innerWidth - GRID_MARGIN), dataSaver);
  const queries = useMemo(() => (spec ? resolveQueries(spec, { filters, sources }) : []), [spec, filters, sources]);

  const query = useInfiniteQuery({
    queryKey: ['feed', spec?.key ?? null, filters, sources, thumbWidth, filters.ratio === 'screen' ? ratio.toFixed(2) : null],
    enabled: !!spec && queries.length > 0,
    initialPageParam: queries.map((): number | null => 1),
    queryFn: ({ pageParam }) => fetchFeedPage(queries, pageParam, { filters, screenRatio: ratio, thumbWidth, sources }),
    getNextPageParam: (last) => (last.cursors.some((c) => c != null) ? last.cursors : undefined),
    maxPages: 12,
  });

  // Contenus masqués retirés à l'affichage : les réafficher ne demande aucun rechargement.
  const { exclude } = options;
  const items = useMemo(() => {
    const hidden = { hiddenIds, hiddenAuthors, hiddenWords };
    return dedupe(query.data?.pages.flatMap((p) => p.items) ?? []).filter((w) => !isHidden(w, hidden) && !exclude?.(w));
  }, [query.data, hiddenIds, hiddenAuthors, hiddenWords, exclude]);
  const errors = query.data?.pages[query.data.pages.length - 1]?.errors ?? [];
  return { ...query, items, errors, noSources: !!spec && queries.length === 0 };
}
