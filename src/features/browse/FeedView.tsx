import { type RefObject, useCallback } from 'react';
import { useNavigation } from '@/app/navigation';
import type { FeedSpec } from '@/features/sources/feed';
import { ApiError } from '@/features/sources/types';
import { useOnline } from '@/shared/lib/useOnline';
import { Button, EmptyState, Spinner } from '@/shared/ui/components';
import { GridSkeleton, WallpaperGrid } from './WallpaperGrid';
import { useFeed } from './useFeed';

/** Flux complet : chargement, erreurs (y compris partielles), résultats vides, grille infinie. */
export function FeedView({ spec, scrollRef }: { spec: FeedSpec; scrollRef: RefObject<HTMLElement | null> }) {
  const feed = useFeed(spec);
  const online = useOnline();
  const setTab = useNavigation((s) => s.setTab);
  const { fetchNextPage } = feed;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  if (feed.noSources) {
    return (
      <EmptyState
        icon="settings"
        title="Aucune source active"
        text="Active Unsplash ou Pexels dans les réglages."
        action={<Button variant="tonal" onClick={() => setTab('settings')}>Réglages</Button>}
      />
    );
  }

  // Hors ligne sans données en cache : on l'explique plutôt que d'afficher un chargement sans fin.
  if (feed.items.length === 0 && (!online || feed.fetchStatus === 'paused')) {
    return (
      <EmptyState
        icon="cloudOff"
        title="Hors ligne"
        text="Ce contenu n'a pas encore été chargé. Tes favoris et ton historique restent disponibles."
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
        title={offline ? 'Hors ligne' : 'Chargement impossible'}
        text={
          offline
            ? 'Tes favoris et ton historique restent disponibles dans la bibliothèque.'
            : error instanceof ApiError
              ? error.message
              : 'Une erreur est survenue.'
        }
        action={
          <Button variant="tonal" icon="refresh" onClick={() => void feed.refetch()}>
            Réessayer
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
        <EmptyState icon="imageSearch" title="Aucun résultat" text="Essaie d'autres mots ou retire des filtres." />
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
