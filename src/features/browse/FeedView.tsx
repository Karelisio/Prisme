import { type RefObject, useCallback, useEffect } from 'react';
import { useNavigation } from '@/app/navigation';
import type { FeedSpec } from '@/features/sources/feed';
import { ApiError } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { useOnline } from '@/shared/lib/useOnline';
import { Button, EmptyState, Spinner } from '@/shared/ui/components';
import { GridSkeleton, WallpaperGrid } from './WallpaperGrid';
import { type FeedOptions, useFeed } from './useFeed';

/** En dessous, la page suivante est chargée d'office (résultats filtrés ou masqués). */
const MIN_VISIBLE = 12;
const MAX_AUTO_PAGES = 5;

interface FeedViewProps {
  spec: FeedSpec;
  scrollRef: RefObject<HTMLElement | null>;
  options?: FeedOptions;
  emptyText?: string;
}

/** Flux complet : chargement, erreurs (y compris partielles), résultats vides, grille infinie. */
export function FeedView({ spec, scrollRef, options, emptyText }: FeedViewProps) {
  const feed = useFeed(spec, options);
  const online = useOnline();
  const setTab = useNavigation((s) => s.setTab);
  const { fetchNextPage, hasNextPage, isFetching } = feed;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const pages = feed.data?.pages.length ?? 0;
  const visible = feed.items.length;

  useEffect(() => {
    if (pages > 0 && pages < MAX_AUTO_PAGES && visible < MIN_VISIBLE && hasNextPage && !isFetching) void fetchNextPage();
  }, [pages, visible, hasNextPage, isFetching, fetchNextPage]);

  if (feed.noSources) {
    return (
      <EmptyState
        icon="settings"
        title={t('Aucune source active')}
        text={t('Les sources de ce flux sont désactivées : active-les dans Réglages › Sources.')}
        action={<Button variant="tonal" onClick={() => setTab('settings')}>{t('Réglages')}</Button>}
      />
    );
  }

  // Hors ligne sans données en cache : on l'explique plutôt que d'afficher un chargement sans fin.
  if (feed.items.length === 0 && (!online || feed.fetchStatus === 'paused')) {
    return (
      <EmptyState
        icon="cloudOff"
        title={t('Hors ligne')}
        text={t("Ce contenu n'a pas encore été chargé. Tes favoris et ton historique restent disponibles.")}
      />
    );
  }

  if (feed.isPending) return <GridSkeleton />;

  if (feed.isError && feed.items.length === 0) {
    const error = feed.error;
    const offline = !online || (error instanceof ApiError && error.kind === 'network');
    return (
      <EmptyState
        icon={offline ? 'cloudOff' : 'error'}
        title={offline ? t('Hors ligne') : t('Chargement impossible')}
        text={
          offline
            ? t('Tes favoris et ton historique restent disponibles dans la bibliothèque.')
            : error instanceof ApiError
              ? error.message
              : t('Une erreur est survenue.')
        }
        action={
          <Button variant="tonal" icon="refresh" onClick={() => void feed.refetch()}>
            {t('Réessayer')}
          </Button>
        }
      />
    );
  }

  const partialErrors = feed.errors.filter((e, i, all) => all.findIndex((x) => x.source === e.source) === i);

  return (
    <>
      {partialErrors.length > 0 && (
        <div className="feed-notice" role="status">
          {partialErrors.map((e) => (
            <p key={e.source}>{e.message}</p>
          ))}
        </div>
      )}
      {feed.items.length === 0 ? (
        feed.isFetching ? (
          <GridSkeleton />
        ) : (
          <EmptyState icon="imageSearch" title={t('Aucun résultat')} text={emptyText ?? t("Essaie d'autres mots ou retire des filtres.")} />
        )
      ) : (
        <WallpaperGrid
          items={feed.items}
          scrollRef={scrollRef}
          hasMore={feed.hasNextPage}
          loadingMore={feed.isFetchingNextPage}
          onEndReached={loadMore}
          footer={
            feed.isFetchingNextPage ? (
              <div className="feed-footer">
                <Spinner size={32} />
              </div>
            ) : null
          }
        />
      )}
    </>
  );
}
