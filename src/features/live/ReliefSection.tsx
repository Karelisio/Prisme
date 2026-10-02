import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { WallpaperPicker } from '@/features/automation/components';
import { useThumbSrc } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeLive, type ReliefProgress } from '@/shared/native/automation';
import { Button, Icon, LinearProgress, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { LiveActivateButton } from './LiveActivate';
import { activateLiveMode, useSceneSettings } from './live';
import type { ModeSectionProps } from './modes';
import { RELIEF_DEFAULTS, prepareRelief, reliefReady, reliefStageLabel, useRelief } from './relief';

/**
 * Genre « Relief 3D » : le sujet de la photo, détouré sur l'appareil, se détache du fond quand le téléphone
 * bouge. La préparation (détourage, arrière-plan comblé) se fait une fois, avant l'activation.
 */
export function ReliefSection({ optionOn, status, refresh }: ModeSectionProps) {
  const wallpaper = useRelief((s) => s.wallpaper);
  const preparedId = useRelief((s) => s.preparedId);
  const [settings, updateSettings] = useSceneSettings('relief', RELIEF_DEFAULTS);
  const relief = useQuery({ queryKey: ['live-relief'], queryFn: () => PrismeLive.getRelief() });
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<ReliefProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;
  const ready = reliefReady(relief.data, wallpaper, preparedId);

  const prepare = async () => {
    if (!wallpaper || busy) return;
    setError(null);
    setProgress({ stage: 'image' });
    try {
      await prepareRelief(wallpaper, setProgress);
      await relief.refetch();
      showSnackbar(t('Relief prêt : le sujet se détache du fond'));
    } catch (e) {
      setError(nativeErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  let help: string;
  if (!wallpaper) help = t('Choisis une photo avec un sujet bien net au premier plan : une personne, un animal, un objet.');
  else if (ready) help = t('Relief prêt : le sujet a été détouré et le fond comblé derrière lui.');
  else help = t('Le sujet est détouré sur l’appareil. La première fois, un module de Google Play services est téléchargé.');

  return (
    <>
      <p className="option-hint option-hint--padded">
        {t('Le sujet de la photo se détache du fond : il bouge un peu plus que lui quand tu inclines le téléphone.')}
      </p>
      <div className="option-block live-choice">
        {wallpaper ? <ReliefThumb wallpaper={wallpaper} /> : <div className="live-thumb live-thumb--empty"><Icon name="image" size={32} /></div>}
        {ready && relief.data?.preview && <img className="live-thumb relief-preview" src={relief.data.preview} alt={t('Sujet détouré')} />}
        <Button variant="outlined" disabled={busy} onClick={() => setPicking(true)}>
          {wallpaper ? t('Changer de photo') : t('Choisir une photo')}
        </Button>
      </div>
      <p className="option-hint option-hint--padded">{help}</p>

      <div className="option-actions">
        <Button variant="tonal" icon="layers" disabled={!wallpaper || busy} onClick={() => void prepare()}>
          {busy ? t('Préparation…') : t('Préparer le relief')}
        </Button>
      </div>
      {progress && (
        <div className="relief-progress" role="status">
          <LinearProgress value={progress.stage === 'module' ? progress.progress : undefined} label={t('Préparation du relief')} />
          <span>{reliefStageLabel(progress)}</span>
        </div>
      )}
      {error && (
        <p className="option-hint option-hint--padded relief-error" role="alert">
          {error}
        </p>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Profondeur')}</h2>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.depth}
          aria-label={t('Profondeur')}
          onChange={(e) => updateSettings({ depth: Number(e.target.value) })}
        />
        <div className="live-scale">
          <span>{t('Subtile')}</span>
          <span>{t('Prononcée')}</span>
        </div>
      </div>
      <ListItem
        headline={t('Ombre sous le sujet')}
        supporting={t('Une ombre douce sur le fond accentue le relief')}
        leading={<Icon name="blur" />}
        trailing={<Switch label={t('Ombre sous le sujet')} checked={settings.shadow} onChange={(shadow) => updateSettings({ shadow })} />}
      />

      <LiveActivateButton status={status} disabled={!optionOn || !ready || busy} refresh={refresh} onActivate={() => activateLiveMode('relief')} />

      <WallpaperPicker
        open={picking}
        title={t('Photo du relief')}
        onClose={() => setPicking(false)}
        onPick={(w) => {
          useRelief.setState({ wallpaper: w });
          setError(null);
        }}
      />
    </>
  );
}

function ReliefThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img className="live-thumb" src={src} alt="" style={{ backgroundColor: wallpaper.color }} />;
}
