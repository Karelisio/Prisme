import { goBack } from '@/app/navigation';
import { TargetChips } from '@/features/automation/components';
import { useSettings } from '@/features/settings/store';
import { t } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeMusic } from '@/shared/native/music';
import { Button, Icon, IconButton, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { MUSIC_STATUS, musicStatusKind } from './model';
import { useMusicPrefs } from './store';
import { useMusicStatus } from './useMusicStatus';
import '@/features/automation/automation.css';

export function MusicScreen() {
  const enabled = useSettings((s) => s.features.music);
  const setFeature = useSettings((s) => s.setFeature);
  const target = useMusicPrefs((s) => s.target);
  const restore = useMusicPrefs((s) => s.restore);
  const update = useMusicPrefs((s) => s.update);
  const status = useMusicStatus();
  const kind = status ? musicStatusKind(status, enabled) : null;

  const openAccessSettings = async () => {
    try {
      await PrismeMusic.openAccessSettings();
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t("Pochette d'album")}</h1>
        <Switch label={t('Activer la pochette de la musique')} checked={enabled} onChange={(v) => setFeature('music', v)} />
      </header>
      <p className="option-intro">
        {t(
          "Quand une musique joue, dans n'importe quelle appli, le fond d'écran devient la pochette du morceau, nette au centre sur son propre fond flouté. Quand la lecture s'arrête, ton fond d'avant revient. Les fonds dynamiques, la rotation et le mode focus attendent la fin de la musique.",
        )}
      </p>

      {kind && (
        <div className="option-status" role="status">
          <Icon name={MUSIC_STATUS[kind].icon} />
          {t(MUSIC_STATUS[kind].text)}
        </div>
      )}

      {kind === 'access' && (
        <>
          <div className="option-actions">
            <Button variant="tonal" icon="notifications" onClick={() => void openAccessSettings()}>
              {t('Ouvrir les réglages')}
            </Button>
          </div>
          <div className="option-block">
            <p className="option-hint">
              {t(
                "Android ne montre la musique en cours qu'aux applis autorisées à lire les notifications. Prisme n'utilise cet accès que pour savoir quel morceau joue : il ne lit et ne garde aucune notification.",
              )}
            </p>
            <p className="option-hint">
              {t(
                "Si Android refuse le réglage (appli installée hors du Play Store), ouvre les infos de l'appli Prisme, touche ⋮ puis autorise les paramètres restreints.",
              )}
            </p>
          </div>
        </>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Écran')}</h2>
        <TargetChips value={target} onChange={(next) => update({ target: next })} />
      </div>

      <ListItem
        headline={t('Revenir au fond précédent')}
        supporting={t("Environ une minute après l'arrêt de la musique")}
        leading={<Icon name="undo" />}
        trailing={<Switch label={t('Revenir au fond précédent')} checked={restore} onChange={(v) => update({ restore: v })} />}
      />
    </div>
  );
}
