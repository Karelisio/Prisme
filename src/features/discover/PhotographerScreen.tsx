import { useMemo, useRef } from 'react';
import { goBack } from '@/app/navigation';
import { FeedView } from '@/features/browse/FeedView';
import '@/features/browse/browse.css';
import type { FeedSpec } from '@/features/sources/feed';
import { DEFAULT_FILTERS } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { haptic } from '@/shared/lib/haptics';
import { Button, Icon, IconButton } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { type Photographer, useDiscover } from './store';
import './discover.css';

export function photographerSpec(p: Photographer): FeedSpec {
  return { key: `user:${p.username}`, queries: [{ kind: 'unsplash-user', username: p.username }] };
}

/** Bouton « Suivre » / « Abonné » d'un photographe Unsplash. */
export function FollowButton({ photographer }: { photographer: Photographer }) {
  const following = useDiscover((s) => s.following.some((f) => f.username === photographer.username));
  const follow = useDiscover((s) => s.follow);
  const unfollow = useDiscover((s) => s.unfollow);
  const toggle = () => {
    haptic('tick');
    if (following) {
      unfollow(photographer.username);
      showSnackbar(t('Tu ne suis plus {name}', { name: photographer.name }));
    } else {
      follow(photographer);
      showSnackbar(t('Tu suis {name} : ses fonds sont dans Explorer › Abonnements', { name: photographer.name }));
    }
  };
  return (
    <Button variant={following ? 'tonal' : 'filled'} icon={following ? 'personCheck' : 'personAdd'} onClick={toggle} aria-pressed={following}>
      {following ? t('Abonné') : t('Suivre')}
    </Button>
  );
}

/** Tous les fonds d'un photographe Unsplash, les plus récents d'abord. */
export function PhotographerScreen({ photographer }: { photographer: Photographer }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const spec = useMemo(() => photographerSpec(photographer), [photographer]);
  const options = useMemo(() => ({ filters: DEFAULT_FILTERS }), []);
  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{photographer.name}</h1>
      </header>
      <div className="photographer-head">
        <span className="photographer-head__avatar" aria-hidden="true">
          <Icon name="person" />
        </span>
        <div className="photographer-head__text">
          <p className="photographer-head__name">{photographer.name}</p>
          <a className="photographer-head__link" href={photographer.url} target="_blank" rel="noopener noreferrer">
            {t('Profil Unsplash')}
          </a>
        </div>
        <FollowButton photographer={photographer} />
      </div>
      <FeedView spec={spec} scrollRef={scrollRef} options={options} emptyText={t('Aucun fond portrait chez ce photographe.')} />
    </div>
  );
}
