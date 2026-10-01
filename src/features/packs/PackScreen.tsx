import { useMemo, useRef } from 'react';
import { goBack } from '@/app/navigation';
import { FeedView } from '@/features/browse/FeedView';
import { EmptyState, IconButton } from '@/shared/ui/components';
import { usePacks } from './PacksList';
import { packFeed } from './packs';

export function PackScreen({ packId }: { packId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data } = usePacks();
  const pack = data?.packs.find((p) => p.id === packId);
  const spec = useMemo(() => (pack ? packFeed(pack) : null), [pack]);

  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">{pack?.title ?? 'Pack'}</h1>
      </header>
      {pack && spec ? (
        <>
          <p className="pack-intro">{pack.description}</p>
          <FeedView spec={spec} scrollRef={scrollRef} />
        </>
      ) : (
        <EmptyState icon="layers" title="Pack introuvable" />
      )}
    </div>
  );
}
