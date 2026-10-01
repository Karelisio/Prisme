import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { goBack } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { Button, Chip, Icon, IconButton, ListItem, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { TargetChips } from './components';
import { FAVORITES_SOURCE, INTERVALS, rotationItems } from './model';
import { useAutomationPrefs } from './store';

export function RotationScreen() {
  const prefs = useAutomationPrefs((s) => s.rotation);
  const update = useAutomationPrefs((s) => s.updateRotation);
  const enabled = useSettings((s) => s.features.rotation);
  const setFeature = useSettings((s) => s.setFeature);
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const collections = useLibrary((s) => s.collections);
  const count = useMemo(
    () => rotationItems(prefs.source, { favorites, items, collections }).length,
    [prefs.source, favorites, items, collections],
  );
  const status = useQuery({ queryKey: ['automation-status'], queryFn: () => PrismeAutomation.getStatus(), refetchInterval: 10_000 });
  const nextChange =
    enabled && status.data?.lastRotationAt
      ? new Date(status.data.lastRotationAt + prefs.intervalMinutes * 60_000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null;

  const next = async () => {
    try {
      await PrismeAutomation.nextRotation();
      showSnackbar('Fond suivant en cours d’application');
      setTimeout(() => void status.refetch(), 2000);
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

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
          <Icon name={count > 1 ? 'autorenew' : 'info'} />
          {count > 1
            ? `${count} fonds en rotation${nextChange ? ` · prochain changement vers ${nextChange}` : ''}`
            : 'Il faut au moins deux fonds dans la source choisie.'}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">Source</h2>
        <div className="chip-wrap">
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

      <ListItem
        headline="Ordre aléatoire"
        supporting="Sinon, dans l'ordre de la source"
        leading={<Icon name="shuffle" />}
        trailing={<Switch label="Ordre aléatoire" checked={prefs.shuffle} onChange={(shuffle) => update({ shuffle })} />}
      />

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>

      <div className="option-actions">
        <Button variant="tonal" icon="autorenew" disabled={!enabled || count < 2} onClick={() => void next()}>
          Changer maintenant
        </Button>
      </div>
    </div>
  );
}
