import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { goBack } from '@/app/navigation';
import { useSettings } from '@/features/settings/store';
import { getJson, withParams } from '@/shared/lib/http';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { Button, Icon, IconButton, ListItem, SegmentedButtons, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { RefRow, TargetChips, WallpaperPicker } from './components';
import { searchPlaces } from './geocoding';
import { BATTERY_LEVELS, type DynamicModeKey, type Place, SEASONS, TIME_SLOTS, WEATHER_KINDS, type WeatherKey } from './model';
import { useAutomationPrefs } from './store';

const MODES = [
  { value: 'time', label: 'Heure' },
  { value: 'weather', label: 'Météo' },
  { value: 'season', label: 'Saison' },
  { value: 'battery', label: 'Batterie' },
] as const satisfies readonly { value: DynamicModeKey; label: string }[];

interface Picking {
  label: string;
  assign: (id: string) => void;
}

export function DynamicScreen() {
  const prefs = useAutomationPrefs((s) => s.dynamic);
  const update = useAutomationPrefs((s) => s.updateDynamic);
  const enabled = useSettings((s) => s.features.dynamic);
  const setFeature = useSettings((s) => s.setFeature);
  const [picking, setPicking] = useState<Picking | null>(null);

  const configuredCount = {
    time: Object.values(prefs.slots).filter(Boolean).length,
    weather: prefs.place ? Object.values(prefs.weather).filter(Boolean).length : 0,
    season: Object.values(prefs.seasons).filter(Boolean).length,
    battery: Object.values(prefs.battery).filter(Boolean).length,
  }[prefs.mode];

  const runNow = async () => {
    try {
      await PrismeAutomation.runNow();
      showSnackbar('Mise à jour du fond lancée');
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Fonds dynamiques</h1>
        <Switch label="Activer les fonds dynamiques" checked={enabled} onChange={(v) => setFeature('dynamic', v)} />
      </header>
      <p className="option-intro">
        Ton fond change tout seul selon la situation, même app fermée. Choisis un fond pour chaque cas : les cas sans fond
        sont ignorés.
      </p>

      <div className="option-block">
        <SegmentedButtons label="Déclencheur" options={MODES} value={prefs.mode} onChange={(mode) => update({ mode })} />
      </div>

      {enabled && configuredCount === 0 && (
        <div className="option-status" role="status">
          <Icon name="info" />
          {prefs.mode === 'weather' && !prefs.place ? 'Choisis un lieu puis des fonds.' : 'Choisis au moins un fond pour démarrer.'}
        </div>
      )}

      {prefs.mode === 'time' &&
        TIME_SLOTS.map((slot) => (
          <RefRow
            key={slot.key}
            icon={slot.icon}
            label={slot.label}
            wallpaperId={prefs.slots[slot.key]}
            onChoose={() => setPicking({ label: slot.label, assign: (id) => update({ slots: { ...prefs.slots, [slot.key]: id } }) })}
            onClear={() => update({ slots: { ...prefs.slots, [slot.key]: undefined } })}
          >
            <input
              type="time"
              className="time-input"
              aria-label={`Début : ${slot.label}`}
              value={prefs.slotStarts[slot.key]}
              onChange={(e) => e.target.value && update({ slotStarts: { ...prefs.slotStarts, [slot.key]: e.target.value } })}
            />
          </RefRow>
        ))}

      {prefs.mode === 'weather' && (
        <>
          <PlacePicker place={prefs.place} onChange={(place) => update({ place })} />
          {WEATHER_KINDS.map((kind) => (
            <RefRow
              key={kind.key}
              icon={kind.icon}
              label={kind.label}
              wallpaperId={prefs.weather[kind.key]}
              onChoose={() => setPicking({ label: kind.label, assign: (id) => update({ weather: { ...prefs.weather, [kind.key]: id } }) })}
              onClear={() => update({ weather: { ...prefs.weather, [kind.key]: undefined } })}
            />
          ))}
        </>
      )}

      {prefs.mode === 'season' && (
        <>
          <div className="option-block">
            <SegmentedButtons
              label="Hémisphère"
              options={[
                { value: 'north', label: 'Hémisphère nord' },
                { value: 'south', label: 'Hémisphère sud' },
              ]}
              value={prefs.hemisphere}
              onChange={(hemisphere) => update({ hemisphere })}
            />
          </div>
          {SEASONS.map((season) => (
            <RefRow
              key={season.key}
              icon={season.icon}
              label={season.label}
              wallpaperId={prefs.seasons[season.key]}
              onChoose={() => setPicking({ label: season.label, assign: (id) => update({ seasons: { ...prefs.seasons, [season.key]: id } }) })}
              onClear={() => update({ seasons: { ...prefs.seasons, [season.key]: undefined } })}
            />
          ))}
        </>
      )}

      {prefs.mode === 'battery' &&
        BATTERY_LEVELS.map((level) => (
          <RefRow
            key={level.key}
            icon={level.icon}
            label={level.label}
            wallpaperId={prefs.battery[level.key]}
            onChoose={() => setPicking({ label: level.label, assign: (id) => update({ battery: { ...prefs.battery, [level.key]: id } }) })}
            onClear={() => update({ battery: { ...prefs.battery, [level.key]: undefined } })}
          />
        ))}

      <div className="option-block">
        <h2 className="option-block__title">Écran</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>
      <div className="option-actions">
        <Button variant="tonal" icon="refresh" disabled={!enabled || configuredCount === 0} onClick={() => void runNow()}>
          Appliquer maintenant
        </Button>
      </div>

      <WallpaperPicker
        open={picking !== null}
        title={picking ? `Fond « ${picking.label} »` : ''}
        onClose={() => setPicking(null)}
        onPick={(w) => picking?.assign(w.id)}
      />
    </div>
  );
}

const WEATHER_LABELS = Object.fromEntries(WEATHER_KINDS.map((k) => [k.key, k.label])) as Record<WeatherKey, string>;

/** Lieu de la météo : recherche de ville ou position approximative de l'appareil. */
function PlacePicker({ place, onChange }: { place: Place | null; onChange: (place: Place) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const current = useQuery({
    queryKey: ['weather-now', place?.latitude, place?.longitude],
    enabled: !!place,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const res = await getJson<{ current: { weather_code: number; is_day: number } }>(
        withParams('https://api.open-meteo.com/v1/forecast', {
          latitude: place!.latitude,
          longitude: place!.longitude,
          current: 'weather_code,is_day',
        }),
      );
      return weatherKey(res.data.current.weather_code, res.data.current.is_day === 1);
    },
  });

  const search = async () => {
    setSearching(true);
    try {
      setResults(await searchPlaces(query));
    } catch {
      showSnackbar('Recherche de ville impossible');
    } finally {
      setSearching(false);
    }
  };

  const locate = async () => {
    try {
      const { latitude, longitude } = await PrismeAutomation.getApproximateLocation();
      onChange({ name: 'Ma position', latitude, longitude });
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  return (
    <div className="option-block">
      <h2 className="option-block__title">Lieu</h2>
      {place && (
        <ListItem
          headline={place.name}
          supporting={current.data ? `Actuellement : ${WEATHER_LABELS[current.data]}` : 'Météo Open-Meteo'}
          leading={<Icon name="partlyCloudy" />}
        />
      )}
      <form
        className="place-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <TextField label="Ville" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
        <div className="option-actions">
          <Button type="submit" variant="tonal" icon="search" disabled={searching || query.trim().length < 2}>
            Rechercher
          </Button>
          <Button variant="outlined" icon="explore" onClick={() => void locate()}>
            Ma position
          </Button>
        </div>
      </form>
      {results.length > 0 && (
        <ul className="place-results list">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <ListItem
                headline={r.name}
                leading={<Icon name="explore" />}
                onClick={() => {
                  onChange(r);
                  setResults([]);
                  setQuery('');
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Même correspondance que le moteur natif (codes météo WMO). */
export function weatherKey(code: number, isDay: boolean): WeatherKey {
  let key: WeatherKey;
  if (code <= 1) key = 'clear';
  else if (code <= 3) key = 'cloudy';
  else if (code === 45 || code === 48) key = 'fog';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) key = 'rain';
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) key = 'snow';
  else if (code >= 95) key = 'storm';
  else key = 'cloudy';
  return !isDay && key === 'clear' ? 'night' : key;
}
