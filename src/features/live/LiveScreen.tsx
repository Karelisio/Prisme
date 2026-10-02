import { useQuery } from '@tanstack/react-query';
import { goBack } from '@/app/navigation';
import { useSettings } from '@/features/settings/store';
import { type LiveStatus, PrismeLive } from '@/shared/native/automation';
import { Chip, Icon, IconButton, ListItem, Switch } from '@/shared/ui/components';
import { useLive } from './live';
import { LIVE_MODES, PHOTO_MODE } from './modes';
import '@/features/automation/automation.css';
import './live.css';

/** Le fond Prisme qu'Android affiche : celui de la vidéo a son propre nom, tous les autres sont « animés ». */
const activeName = (component: LiveStatus['component']) =>
  component === 'video' ? 'Le fond vidéo Prisme' : 'Le fond animé Prisme';

export function LiveScreen() {
  const enabled = useSettings((s) => s.features.live);
  const setFeature = useSettings((s) => s.setFeature);
  const mode = useLive((s) => s.mode);
  const setMode = useLive((s) => s.setMode);
  const doubleTap = useLive((s) => s.doubleTap);
  const setDoubleTap = useLive((s) => s.setDoubleTap);
  const eco = useLive((s) => s.eco);
  const setEco = useLive((s) => s.setEco);
  const status = useQuery({ queryKey: ['live-status'], queryFn: () => PrismeLive.getStatus(), refetchInterval: 5_000 });
  const current = LIVE_MODES.find((m) => m.key === mode) ?? PHOTO_MODE;
  const refresh = () => void status.refetch();

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Fonds animés</h1>
        <Switch label="Activer l'option fonds animés" checked={enabled} onChange={(v) => setFeature('live', v)} />
      </header>
      <p className="option-intro">
        Un fond qui bouge sur l’écran d’accueil. Il s’arrête dès qu’il n’est plus visible : le capteur et l’animation ne
        tournent que quand tu le regardes.
      </p>

      {status.data?.active && (
        <div className="option-status" role="status">
          <Icon name={status.data.paused ? 'eco' : 'checkCircle'} />
          {`${activeName(status.data.component)} est actif${status.data.paused ? ', figé pour économiser la batterie.' : '.'}`}
        </div>
      )}

      {LIVE_MODES.length > 1 && (
        <div className="option-block">
          <h2 className="option-block__title">Genre</h2>
          <div className="chip-wrap" role="group" aria-label="Genre de fond animé">
            {LIVE_MODES.map((m) => (
              <Chip key={m.key} icon={m.icon} selected={current.key === m.key} onClick={() => setMode(m.key)}>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <current.Section optionOn={enabled} status={status.data} refresh={refresh} />

      <div className="option-block">
        <h2 className="option-block__title">Options</h2>
      </div>
      <ListItem
        headline="Double-tap sur l’écran d’accueil"
        supporting="Image suivante de la liste (Photo), ou nouvelle variante selon le genre"
        leading={<Icon name="touchApp" />}
        trailing={<Switch label="Double-tap sur l’écran d’accueil" checked={doubleTap} onChange={setDoubleTap} />}
      />
      <ListItem
        headline="Pause en économie de batterie"
        supporting="Le fond se fige en économie d’énergie, ou sous 15 % de batterie hors charge"
        leading={<Icon name="eco" />}
        trailing={<Switch label="Pause en économie de batterie" checked={eco} onChange={setEco} />}
      />
    </div>
  );
}
