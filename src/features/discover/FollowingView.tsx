import { type RefObject, useMemo } from 'react';
import { useNavigation } from '@/app/navigation';
import { FeedView } from '@/features/browse/FeedView';
import type { FeedSpec } from '@/features/sources/feed';
import { Chip, EmptyState } from '@/shared/ui/components';
import { useDiscover } from './store';
import './discover.css';

/** Photographes réunis dans le flux (les plus récemment suivis) ; les autres restent sur leur page. */
const MAX_IN_FEED = 6;

/** Explorer › Abonnements : les dernières photos des photographes suivis. */
export function FollowingView({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const following = useDiscover((s) => s.following);
  const push = useNavigation((s) => s.push);
  const spec = useMemo((): FeedSpec | null => {
    const shown = following.slice(0, MAX_IN_FEED);
    if (shown.length === 0) return null;
    return { key: `following:${shown.map((f) => f.username).join(',')}`, queries: shown.map((f) => ({ kind: 'unsplash-user', username: f.username })) };
  }, [following]);

  if (!spec) {
    return (
      <EmptyState
        icon="group"
        title="Aucun abonnement"
        text="Dans l’aperçu d’une photo Unsplash, touche le nom du photographe puis « Suivre »."
      />
    );
  }
  return (
    <>
      <div className="chip-row" aria-label="Photographes suivis">
        {following.map((f) => (
          <Chip key={f.username} icon="person" onClick={() => push({ type: 'photographer', photographer: f })}>
            {f.name}
          </Chip>
        ))}
      </div>
      <FeedView key={spec.key} spec={spec} scrollRef={scrollRef} />
    </>
  );
}
