import { App as CapacitorApp } from '@capacitor/app';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { goBack } from '@/app/navigation';
import { useLibrary } from '@/features/library/store';
import { useSettings } from '@/features/settings/store';
import { t, tn } from '@/shared/i18n';
import { isNative, nativeErrorMessage } from '@/shared/native';
import { type DevicePosition, type LocationPermissions, PrismeAutomation } from '@/shared/native/automation';
import { Button, Chip, Icon, IconButton, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { RefRow, TargetChips, WallpaperPicker } from './components';
import { DEFAULT_PLACE_RADIUS, PLACE_RADII, PLACE_SUGGESTIONS, type PlaceZone } from './model';
import { useAutomationPrefs } from './store';

/** Rayon d'un lieu : l'une des tailles proposées. */
function RadiusChips({ value, label, onChange }: { value: number; label: string; onChange: (meters: number) => void }) {
  return (
    <div className="chip-wrap" role="group" aria-label={label}>
      {PLACE_RADII.map((radius) => (
        <Chip key={radius.meters} selected={value === radius.meters} onClick={() => onChange(radius.meters)}>
          {t(radius.label)}
        </Chip>
      ))}
    </div>
  );
}

/** Autorisations de position, relues au retour dans l'app (l'accès « Toujours » se règle dans les réglages d'Android). */
function useLocationPermissions() {
  const [permissions, setPermissions] = useState<LocationPermissions | null>(null);
  const refresh = useCallback(() => void PrismeAutomation.getLocationPermissions().then(setPermissions, () => undefined), []);
  useEffect(() => {
    refresh();
    const resume = isNative ? CapacitorApp.addListener('resume', refresh) : null;
    return () => void resume?.then((h) => h.remove());
  }, [refresh]);
  return { permissions, setPermissions, refresh };
}

export function PlacesScreen() {
  const prefs = useAutomationPrefs((s) => s.places);
  const update = useAutomationPrefs((s) => s.updatePlaces);
  const enabled = useSettings((s) => s.features.places);
  const setFeature = useSettings((s) => s.setFeature);
  const wallpapers = useLibrary((s) => s.items);
  const { permissions, setPermissions, refresh } = useLocationPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const [picking, setPicking] = useState<PlaceZone | null>(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const [radius, setRadius] = useState(DEFAULT_PLACE_RADIUS);
  const [locating, setLocating] = useState(false);

  const ready = prefs.items.filter((p) => p.wallpaperId && wallpapers[p.wallpaperId]).length;
  const granted = !!permissions?.precise && !!permissions.background;
  // Noms proposés : dans la langue de l'interface, et c'est ce nom-là qui est enregistré (un nom de lieu est un contenu).
  const suggestions = PLACE_SUGGESTIONS.map((s) => t(s)).filter((s) => !prefs.items.some((p) => p.name === s));

  const updatePlace = (id: string, patch: Partial<PlaceZone>) => update({ items: prefs.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const removePlace = (place: PlaceZone) => {
    const index = prefs.items.findIndex((p) => p.id === place.id);
    update({ items: prefs.items.filter((p) => p.id !== place.id) });
    showSnackbar(t('Lieu « {name} » supprimé', { name: place.name }), {
      label: t('Annuler'),
      onAction: () => {
        const items = useAutomationPrefs.getState().places.items;
        update({ items: [...items.slice(0, index), place, ...items.slice(index)] });
      },
    });
  };

  const checkNow = async () => {
    try {
      await PrismeAutomation.runNow();
      showSnackbar(t('Vérification de la position lancée'));
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const requestPermissions = async () => {
    try {
      const result = await PrismeAutomation.requestLocationPermissions();
      setPermissions({ precise: result.precise, background: result.background });
      setHint(result.message ?? null);
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  const locate = async () => {
    setLocating(true);
    try {
      setPosition(await PrismeAutomation.getCurrentPosition());
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    } finally {
      setLocating(false);
      // L'autorisation a pu être accordée à cette occasion.
      refresh();
    }
  };

  const addPlace = (e: FormEvent) => {
    e.preventDefault();
    if (!position || !name.trim()) return;
    const place: PlaceZone = { id: crypto.randomUUID(), name: name.trim(), latitude: position.latitude, longitude: position.longitude, radius, wallpaperId: null };
    update({ items: [...prefs.items, place] });
    setName('');
    setPosition(null);
    setRadius(DEFAULT_PLACE_RADIUS);
  };

  const setupText =
    prefs.items.length === 0
      ? t('Ajoute un lieu pour démarrer.')
      : ready === 0
        ? t('Choisis un fond pour au moins un lieu.')
        : tn(ready, '{count} lieu surveillé.', '{count} lieux surveillés.');
  const permissionText = !permissions?.precise
    ? t('Autorise la position précise : Prisme en a besoin pour savoir quand tu es dans un lieu.')
    : t('Choisis « Toujours autoriser » pour la position : sans cela, Prisme ne la lit pas quand l’app est fermée.');

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Selon le lieu')}</h1>
        <Switch label={t('Activer « Selon le lieu »')} checked={enabled} onChange={(v) => setFeature('places', v)} />
      </header>
      <p className="option-intro">
        {t(
          'Un fond pour chaque lieu (maison, travail…). Prisme le pose quand ton téléphone est dans la zone, même app fermée, puis remet ton fond habituel en sortant. La position est vérifiée environ toutes les 15 minutes (Android peut retarder ces vérifications pour économiser la batterie) et reste sur ton téléphone. Le mode focus passe avant ; les fonds dynamiques et la rotation passent après.',
        )}
      </p>

      {enabled && (
        <div className="option-status" role="status">
          <Icon name={ready > 0 ? 'place' : 'info'} />
          {setupText}
        </div>
      )}

      {enabled && permissions && (
        <>
          <div className="option-status" role="status">
            <Icon name={granted ? 'checkCircle' : 'info'} />
            <span>
              {granted ? t('Autorisations de position accordées.') : permissionText}
              {!granted && hint ? ` ${hint}` : ''}
            </span>
          </div>
          {!granted && (
            <div className="option-actions">
              <Button variant="tonal" icon="place" onClick={() => void requestPermissions()}>
                {t('Autoriser la position')}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Lieux')}</h2>
        {prefs.items.length === 0 && <p className="option-hint">{t('Aucun lieu pour l’instant.')}</p>}
        {prefs.items.length > 1 && <p className="option-hint">{t('Si des zones se recouvrent, le premier lieu de la liste l’emporte.')}</p>}
      </div>
      {prefs.items.map((place) => (
        <div key={place.id} className="place-card">
          <RefRow
            icon="place"
            label={place.name}
            supporting={place.wallpaperId ? undefined : t('Choisis un fond pour ce lieu')}
            wallpaperId={place.wallpaperId}
            onChoose={() => setPicking(place)}
            onClear={() => updatePlace(place.id, { wallpaperId: null })}
          />
          <div className="place-card__footer">
            <RadiusChips value={place.radius} label={t('Rayon : {name}', { name: place.name })} onChange={(meters) => updatePlace(place.id, { radius: meters })} />
            <Button variant="text" icon="delete" aria-label={t('Supprimer le lieu « {name} »', { name: place.name })} onClick={() => removePlace(place)}>
              {t('Supprimer')}
            </Button>
          </div>
        </div>
      ))}

      <form className="option-block place-add" aria-label={t('Ajouter un lieu')} onSubmit={addPlace}>
        <h2 className="option-block__title">{t('Ajouter un lieu')}</h2>
        <TextField
          label={t('Nom du lieu')}
          placeholder={t('ex. Maison')}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {suggestions.length > 0 && (
          <div className="chip-wrap option-field" role="group" aria-label={t('Noms proposés')}>
            {suggestions.map((suggestion) => (
              <Chip key={suggestion} selected={name === suggestion} onClick={() => setName(suggestion)}>
                {suggestion}
              </Chip>
            ))}
          </div>
        )}
        <div className="option-actions">
          <Button variant="tonal" icon="myLocation" disabled={locating} onClick={() => void locate()}>
            {locating ? t('Recherche de la position…') : t('Utiliser ma position actuelle')}
          </Button>
        </div>
        <p className="option-hint" role="status">
          {position
            ? position.accuracy !== undefined
              ? t('Position trouvée (± {meters} m).', { meters: Math.round(position.accuracy) })
              : t('Position trouvée.')
            : t('À faire sur place : la zone sera centrée sur ta position.')}
        </p>
        <h2 className="option-block__title option-field">{t('Rayon de la zone')}</h2>
        <RadiusChips value={radius} label={t('Rayon du nouveau lieu')} onChange={setRadius} />
        <div className="option-actions">
          <Button type="submit" icon="add" disabled={!position || !name.trim()}>
            {t('Ajouter ce lieu')}
          </Button>
        </div>
      </form>

      <div className="option-block">
        <h2 className="option-block__title">{t('Écran')}</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>
      <div className="option-actions">
        <Button variant="tonal" icon="refresh" disabled={!enabled || ready === 0} onClick={() => void checkNow()}>
          {t('Vérifier maintenant')}
        </Button>
      </div>

      <WallpaperPicker
        open={picking !== null}
        title={picking ? t('Fond « {label} »', { label: picking.name }) : ''}
        onClose={() => setPicking(null)}
        onPick={(w) => picking && updatePlace(picking.id, { wallpaperId: w.id })}
      />
    </div>
  );
}
