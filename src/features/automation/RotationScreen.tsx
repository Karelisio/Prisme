import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { goBack } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { REMOTE_SOURCES, SOURCE_INFO, usableSources } from '@/features/sources/registry';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { Button, Chip, Icon, IconButton, ListItem, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { TargetChips } from './components';
import { FAVORITES_SOURCE, INTERVALS, rotationItems } from './model';
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
  const onlinePrefs = { ...DEFAULT_ONLINE, ...prefs.online };
  const count = useMemo(
    () => (online ? 0 : rotationItems(prefs.source, { favorites, items, collections }).length),
    [online, prefs.source, favorites, items, collections],
  );
  const providers = useMemo(() => {
    const usable = usableSources(sourceToggles);
    return ONLINE_PROVIDERS.filter((s) => usable[s]).map((s) => SOURCE_INFO[s].name);
  }, [sourceToggles]);
  const status = useQuery({ queryKey: ['automation-status'], queryFn: () => PrismeAutomation.getStatus(), refetchInterval: 10_000 });
  const nextChange =
    enabled && status.data?.lastRotationAt
      ? new Date(status.data.lastRotationAt + prefs.intervalMinutes * 60_000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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

  const next = async () => {
    try {
      await PrismeAutomation.nextRotation();
      showSnackbar(online ? 'Nouveau fond en cours de téléchargement' : 'Fond suivant en cours d’application');
      setTimeout(() => void status.refetch(), 2000);
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const statusText = online
    ? providers.length === 0
      ? 'Aucune source en ligne active : active-en une dans Réglages › Sources.'
      : missingKeyword
        ? 'Saisis un mot-clé pour la rotation en ligne.'
        : `Fonds au hasard en ligne : ${onlineThemeLabel(onlinePrefs)}${nextChange ? ` · prochain changement vers ${nextChange}` : ''}`
    : count > 1
      ? `${count} fonds en rotation${nextChange ? ` · prochain changement vers ${nextChange}` : ''}`
      : 'Il faut au moins deux fonds dans la source choisie.';

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Rotation</h1>
        <Switch label="Activer la rotation" checked={enabled} onChange={(v) => setFeature('rotation', v)} />
      </header>
      <p className="option-intro">
        Prisme change de fond à intervalle régulier, même app fermée (Android peut décaler un peu l'heure exacte pour
        économiser la batterie). Les fonds dynamiques et le mode focus restent prioritaires.
      </p>

      {enabled && (
        <div className="option-status" role="status">
          <Icon name={ready ? 'autorenew' : 'info'} />
          {statusText}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Source</h2>
        <div className="chip-wrap">
          <Chip icon="explore" selected={online} onClick={() => update({ source: ONLINE_SOURCE })}>
            En ligne, au hasard
          </Chip>
          <Chip selected={prefs.source === FAVORITES_SOURCE} onClick={() => update({ source: FAVORITES_SOURCE })}>
            Favoris ({Object.keys(favorites).length})
          </Chip>
          {collections.map((c) => (
            <Chip key={c.id} selected={prefs.source === c.id} onClick={() => update({ source: c.id })}>
              {c.name} ({c.itemIds.length})
            </Chip>
          ))}
        </div>
      </div>

      {online && (
        <>
          <div className="option-block">
            <h2 className="option-block__title">Thème</h2>
            <div className="chip-wrap" aria-label="Thème de la rotation en ligne">
              {ONLINE_THEMES.map((theme) => (
                <Chip key={theme.key} selected={onlinePrefs.theme === theme.key} onClick={() => updateOnline({ theme: theme.key })}>
                  {theme.label}
                </Chip>
              ))}
            </div>
            {onlinePrefs.theme === 'custom' && (
              <form className="option-field" onSubmit={commitKeyword}>
                <TextField
                  label="Mot-clé"
                  placeholder="ex. aurore boréale, forêt, néon"
                  enterKeyHint="done"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onBlur={() => commitKeyword()}
                />
              </form>
            )}
            {onlinePrefs.theme === 'foryou' && (
              <p className="option-hint">D’après tes favoris (sujets, photographes et couleurs) ; sans favoris, des fonds d’écran au hasard.</p>
            )}
            <p className="option-hint">
              {providers.length > 0 ? `Sources : ${providers.join(', ')} (Réglages › Sources).` : 'Aucune source active (Réglages › Sources).'} Les
              contenus masqués ne sont jamais choisis.
            </p>
          </div>
          <ListItem
            headline="Uniquement en Wi-Fi"
            supporting="Sur données mobiles, le fond actuel reste en place"
            leading={<Icon name="wifi" />}
            trailing={<Switch label="Uniquement en Wi-Fi" checked={onlinePrefs.wifiOnly} onChange={(wifiOnly) => updateOnline({ wifiOnly })} />}
          />
        </>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Changer toutes les</h2>
        <div className="chip-wrap">
          {INTERVALS.map((interval) => (
            <Chip key={interval.minutes} selected={prefs.intervalMinutes === interval.minutes} onClick={() => update({ intervalMinutes: interval.minutes })}>
              {interval.label}
            </Chip>
          ))}
        </div>
      </div>

      {!online && (
        <ListItem
          headline="Ordre aléatoire"
          supporting="Sinon, dans l'ordre de la source"
          leading={<Icon name="shuffle" />}
          trailing={<Switch label="Ordre aléatoire" checked={prefs.shuffle} onChange={(shuffle) => update({ shuffle })} />}
        />
      )}

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>

      <div className="option-actions">
        <Button variant="tonal" icon="autorenew" disabled={!enabled || !ready} onClick={() => void next()}>
          Changer maintenant
        </Button>
      </div>
    </div>
  );
}
