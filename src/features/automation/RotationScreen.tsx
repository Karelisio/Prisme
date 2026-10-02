import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { goBack } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { REMOTE_SOURCES, SOURCE_INFO, usableSources } from '@/features/sources/registry';
import { locale, t, tn } from '@/shared/i18n';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { Button, Chip, Icon, IconButton, ListItem, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { TargetChips, collectionLabel } from './components';
import { FAVORITES_SOURCE, FOLDER_SOURCE, INTERVALS, rotationItems } from './model';
import { DEFAULT_ONLINE, ONLINE_SOURCE, ONLINE_THEMES, onlineThemeLabel } from './online';
import { useAutomationPrefs } from './store';

/** Sources interrogées au hasard par la rotation en ligne (Pixabay, limité à 1280 px, est écarté). */
const ONLINE_PROVIDERS = REMOTE_SOURCES.filter((s) => s !== 'pixabay');

export function RotationScreen() {
  const prefs = useAutomationPrefs((s) => s.rotation);
  const update = useAutomationPrefs((s) => s.updateRotation);
  const enabled = useSettings((s) => s.features.rotation);
  const setFeature = useSettings((s) => s.setFeature);
  const sourceToggles = useSettings((s) => s.sources);
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const collections = useLibrary((s) => s.collections);
  const online = prefs.source === ONLINE_SOURCE;
  const folderSource = prefs.source === FOLDER_SOURCE;
  const onlinePrefs = { ...DEFAULT_ONLINE, ...prefs.online };
  const folderUri = prefs.folder?.uri;
  const folderInfo = useQuery({
    queryKey: ['rotation-folder', folderUri],
    enabled: !!folderUri,
    queryFn: () => PrismeAutomation.getFolderInfo({ uri: folderUri as string }),
  });
  const count = useMemo(() => {
    if (online) return 0;
    if (folderSource) return folderInfo.data?.accessible ? folderInfo.data.count : 0;
    return rotationItems(prefs.source, { favorites, items, collections }).length;
  }, [online, folderSource, folderInfo.data, prefs.source, favorites, items, collections]);
  const providers = useMemo(() => {
    const usable = usableSources(sourceToggles);
    return ONLINE_PROVIDERS.filter((s) => usable[s]).map((s) => SOURCE_INFO[s].name);
  }, [sourceToggles]);
  const status = useQuery({ queryKey: ['automation-status'], queryFn: () => PrismeAutomation.getStatus(), refetchInterval: 10_000 });
  const nextChange =
    enabled && status.data?.lastRotationAt
      ? new Date(status.data.lastRotationAt + prefs.intervalMinutes * 60_000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
      : null;
  const missingKeyword = online && onlinePrefs.theme === 'custom' && !onlinePrefs.keyword.trim();
  const ready = online ? providers.length > 0 && !missingKeyword : count > 1;

  const updateOnline = (patch: Partial<typeof onlinePrefs>) => update({ online: { ...onlinePrefs, ...patch } });
  // Mot-clé validé à la fin de la saisie : chaque nouveau mot-clé déclenche un nouveau fond.
  const [keyword, setKeyword] = useState(onlinePrefs.keyword);
  useEffect(() => setKeyword(onlinePrefs.keyword), [onlinePrefs.keyword]);
  const commitKeyword = (e?: FormEvent) => {
    e?.preventDefault();
    if (keyword.trim() !== onlinePrefs.keyword.trim()) updateOnline({ keyword: keyword.trim() });
  };

  const chooseFolder = async () => {
    try {
      const result = await PrismeAutomation.pickFolder();
      if (result.cancelled) return;
      update({ source: FOLDER_SOURCE, folder: { uri: result.uri, name: result.name } });
      void folderInfo.refetch();
      showSnackbar(tn(result.count, 'Dossier « {name} » : {count} photo', 'Dossier « {name} » : {count} photos', { name: result.name }));
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const next = async () => {
    try {
      await PrismeAutomation.nextRotation();
      showSnackbar(online ? t('Nouveau fond en cours de téléchargement') : t('Fond suivant en cours d’application'));
      setTimeout(() => void status.refetch(), 2000);
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const withNextChange = (text: string) => (nextChange ? `${text} · ${t('prochain changement vers {time}', { time: nextChange })}` : text);
  const statusText = online
    ? providers.length === 0
      ? t('Aucune source en ligne active : active-en une dans Réglages › Sources.')
      : missingKeyword
        ? t('Saisis un mot-clé pour la rotation en ligne.')
        : withNextChange(t('Fonds au hasard en ligne : {theme}', { theme: onlineThemeLabel(onlinePrefs) }))
    : folderSource && folderInfo.data && !folderInfo.data.accessible
      ? t('Dossier inaccessible : choisis-le à nouveau.')
      : count > 1
        ? withNextChange(folderSource ? t('{count} photos du dossier en rotation', { count }) : t('{count} fonds en rotation', { count }))
        : t('Il faut au moins deux fonds dans la source choisie.');

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Rotation')}</h1>
        <Switch label={t('Activer la rotation')} checked={enabled} onChange={(v) => setFeature('rotation', v)} />
      </header>
      <p className="option-intro">
        {t(
          "Prisme change de fond à intervalle régulier, même app fermée (Android peut décaler un peu l'heure exacte pour économiser la batterie). Les fonds dynamiques et le mode focus restent prioritaires.",
        )}
      </p>

      {enabled && (
        <div className="option-status" role="status">
          <Icon name={ready ? 'autorenew' : 'info'} />
          {statusText}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Source')}</h2>
        <div className="chip-wrap">
          <Chip icon="explore" selected={online} onClick={() => update({ source: ONLINE_SOURCE })}>
            {t('En ligne, au hasard')}
          </Chip>
          <Chip selected={prefs.source === FAVORITES_SOURCE} onClick={() => update({ source: FAVORITES_SOURCE })}>
            {t('Favoris ({count})', { count: Object.keys(favorites).length })}
          </Chip>
          {collections.map((c) => (
            <Chip key={c.id} selected={prefs.source === c.id} onClick={() => update({ source: c.id })}>
              {collectionLabel(c)} ({c.itemIds.length})
            </Chip>
          ))}
          <Chip
            icon="folderOpen"
            selected={folderSource}
            onClick={() => (prefs.folder ? update({ source: FOLDER_SOURCE }) : void chooseFolder())}
          >
            {prefs.folder ? t('Dossier « {name} »', { name: prefs.folder.name }) : t('Dossier du téléphone…')}
          </Chip>
        </div>
        {folderSource && (
          <div className="option-actions option-actions--flush">
            <Button variant="outlined" icon="folderOpen" onClick={() => void chooseFolder()}>
              {t('Changer de dossier')}
            </Button>
          </div>
        )}
      </div>

      {online && (
        <>
          <div className="option-block">
            <h2 className="option-block__title">{t('Thème')}</h2>
            <div className="chip-wrap" aria-label={t('Thème de la rotation en ligne')}>
              {ONLINE_THEMES.map((theme) => (
                <Chip key={theme.key} selected={onlinePrefs.theme === theme.key} onClick={() => updateOnline({ theme: theme.key })}>
                  {t(theme.label)}
                </Chip>
              ))}
            </div>
            {onlinePrefs.theme === 'custom' && (
              <form className="option-field" onSubmit={commitKeyword}>
                <TextField
                  label={t('Mot-clé')}
                  placeholder={t('ex. aurore boréale, forêt, néon')}
                  enterKeyHint="done"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onBlur={() => commitKeyword()}
                />
              </form>
            )}
            {onlinePrefs.theme === 'foryou' && (
              <p className="option-hint">
                {t('D’après tes favoris (sujets, photographes et couleurs) ; sans favoris, des fonds d’écran au hasard.')}
              </p>
            )}
            <p className="option-hint">
              {providers.length > 0 ? t('Sources : {sources} (Réglages › Sources).', { sources: providers.join(', ') }) : t('Aucune source active (Réglages › Sources).')}{' '}
              {t('Les contenus masqués ne sont jamais choisis.')}
            </p>
          </div>
          <ListItem
            headline={t('Uniquement en Wi-Fi')}
            supporting={t('Sur données mobiles, le fond actuel reste en place')}
            leading={<Icon name="wifi" />}
            trailing={<Switch label={t('Uniquement en Wi-Fi')} checked={onlinePrefs.wifiOnly} onChange={(wifiOnly) => updateOnline({ wifiOnly })} />}
          />
        </>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Changer toutes les')}</h2>
        <div className="chip-wrap">
          {INTERVALS.map((interval) => (
            <Chip key={interval.minutes} selected={prefs.intervalMinutes === interval.minutes} onClick={() => update({ intervalMinutes: interval.minutes })}>
              {t(interval.label)}
            </Chip>
          ))}
        </div>
      </div>

      {!online && (
        <ListItem
          headline={t('Ordre aléatoire')}
          supporting={t("Sinon, dans l'ordre de la source")}
          leading={<Icon name="shuffle" />}
          trailing={<Switch label={t('Ordre aléatoire')} checked={prefs.shuffle} onChange={(shuffle) => update({ shuffle })} />}
        />
      )}
      {(online || prefs.shuffle) && (
        <ListItem
          headline={t('Rotation intelligente')}
          supporting={
            online
              ? t('Fonds sombres la nuit, quand la source en propose')
              : t('Pas de répétition avant d’avoir tout vu, teintes variées, fonds sombres la nuit')
          }
          leading={<Icon name="wandStars" />}
          trailing={<Switch label={t('Rotation intelligente')} checked={prefs.smart !== false} onChange={(smart) => update({ smart })} />}
        />
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Écran')}</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>

      <div className="option-actions">
        <Button variant="tonal" icon="autorenew" disabled={!enabled || !ready} onClick={() => void next()}>
          {t('Changer maintenant')}
        </Button>
      </div>
    </div>
  );
}
