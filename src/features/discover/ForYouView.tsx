import { type RefObject, useMemo } from 'react';
import { FeedView } from '@/features/browse/FeedView';
import { GridSkeleton } from '@/features/browse/WallpaperGrid';
import { useLibrary } from '@/features/library/store';
import { useOnboarding } from '@/features/onboarding/store';
import { tasteLabels, tasteSpec } from '@/features/onboarding/tastes';
import type { Wallpaper } from '@/features/sources/types';
import { EmptyState } from '@/shared/ui/components';
import { MIN_FAVORITES, buildProfile, forYouSpec } from './profile';
import './discover.css';

/** Explorer › Pour toi : suggestions calculées sur le téléphone à partir des favoris. */
export function ForYouView({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const hydrated = useLibrary((s) => s.hydrated);
  const profile = useMemo(
    () => buildProfile(Object.keys(favorites).flatMap((id) => (items[id] ? [items[id]] : []))),
    [favorites, items],
  );
  const spec = useMemo(() => forYouSpec(profile), [profile]);
  // Tant que les favoris ne suffisent pas, « Pour toi » suit les goûts choisis à l'introduction.
  const tastes = useOnboarding((s) => s.tastes);
  const tasteFeed = useMemo(() => tasteSpec(tastes), [tastes]);
  // Les favoris sont déjà connus : on ne les repropose pas.
  const options = useMemo(() => ({ exclude: (w: Wallpaper) => !!useLibrary.getState().favorites[w.id] }), []);

  if (!hydrated) return <GridSkeleton />;
  if (!spec && tasteFeed) {
    return (
      <>
        <p className="discover-intro">D’après tes goûts : {tasteLabels(tastes).join(', ')}. Ajoute des favoris pour affiner.</p>
        <FeedView key={tasteFeed.key} spec={tasteFeed} scrollRef={scrollRef} options={options} />
      </>
    );
  }
  if (!spec) {
    return (
      <EmptyState
        icon="favorite"
        title="Pour toi"
        text={`Ajoute au moins ${MIN_FAVORITES} favoris : Prisme te proposera des fonds proches de tes goûts, calculés sur ton téléphone.`}
      />
    );
  }
  const reasons = [
    profile.keywords.length > 0 && profile.keywords.join(', '),
    profile.photographers.length > 0 && profile.photographers.map((p) => p.name).join(', '),
  ].filter(Boolean);
  return (
    <>
      <p className="discover-intro">D’après tes favoris{reasons.length > 0 ? ` : ${reasons.join(' · ')}` : ''}</p>
      <FeedView key={spec.key} spec={spec} scrollRef={scrollRef} options={options} />
    </>
  );
}
