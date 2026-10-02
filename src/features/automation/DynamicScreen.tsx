import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { goBack } from '@/app/navigation';
import { useSettings } from '@/features/settings/store';
import { t } from '@/shared/i18n';
import { getJson, withParams } from '@/shared/lib/http';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeAutomation } from '@/shared/native/automation';
import { Button, Chip, Icon, IconButton, ListItem, SegmentedButtons, Switch, TextField } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { RefRow, TargetChips, WallpaperPicker } from './components';
import { searchPlaces } from './geocoding';
import {
  BATTERY_LEVELS,
  DEFAULT_AUTOMATION,
  type DynamicModeKey,
  type Place,
  SEASONS,
  SUN_ANCHORS,
  TIME_SLOTS,
  WEATHER_KINDS,
  type WeatherKey,
} from './model';
import { useAutomationPrefs } from './store';
import { formatMinutes, sunTimesOn } from './sun';

/** Libellés en français (données) : `t(label)` à l'affichage. */
const MODES = [
  { value: 'time', label: 'Heure' },
  { value: 'weather', label: 'Météo' },
  { value: 'season', label: 'Saison' },
  { value: 'battery', label: 'Batterie' },
  { value: 'theme', label: 'Mode sombre' },
] as const satisfies readonly { value: DynamicModeKey; label: string }[];

interface Picking {
  label: string;
  assign: (id: string) => void;
}

export function DynamicScreen() {
  const stored = useAutomationPrefs((s) => s.dynamic);
  const prefs = { ...DEFAULT_AUTOMATION.dynamic, ...stored };
  const update = useAutomationPrefs((s) => s.updateDynamic);
  const enabled = useSettings((s) => s.features.dynamic);
  const setFeature = useSettings((s) => s.setFeature);
  const [picking, setPicking] = useState<Picking | null>(null);

  const configuredCount = {
    time: prefs.followSun && !prefs.place ? 0 : Object.values(prefs.slots).filter(Boolean).length,
    weather: prefs.place ? Object.values(prefs.weather).filter(Boolean).length : 0,
    season: Object.values(prefs.seasons).filter(Boolean).length,
    battery: Object.values(prefs.battery).filter(Boolean).length,
    theme: [prefs.theme.light, prefs.theme.dark].filter(Boolean).length,
  }[prefs.mode];
  const sun = prefs.followSun && prefs.place ? sunTimesOn(new Date(), prefs.place.latitude, prefs.place.longitude) : null;

  const runNow = async () => {
    try {
      await PrismeAutomation.runNow();
      showSnackbar(t('Mise à jour du fond lancée'));
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Fonds dynamiques')}</h1>
        <Switch label={t('Activer les fonds dynamiques')} checked={enabled} onChange={(v) => setFeature('dynamic', v)} />
      </header>
      <p className="option-intro">
        {t('Ton fond change tout seul selon la situation, même app fermée. Choisis un fond pour chaque cas : les cas sans fond sont ignorés.')}
      </p>

      <div className="option-block">
        <div className="chip-wrap" role="radiogroup" aria-label={t('Déclencheur')}>
          {MODES.map((m) => (
            <Chip key={m.value} role="radio" aria-checked={prefs.mode === m.value} selected={prefs.mode === m.value} onClick={() => update({ mode: m.value })}>
              {t(m.label)}
            </Chip>
          ))}
        </div>
      </div>

      {enabled && configuredCount === 0 && (
        <div className="option-status" role="status">
          <Icon name="info" />
          {(prefs.mode === 'weather' || (prefs.mode === 'time' && prefs.followSun)) && !prefs.place
            ? t('Choisis un lieu puis des fonds.')
            : t('Choisis au moins un fond pour démarrer.')}
        </div>
      )}

      {prefs.mode === 'time' && (
        <>
          <ListItem
            headline={t('Suivre le soleil')}
            supporting={t('Les créneaux suivent le lever et le coucher du soleil de ta ville, toute l’année')}
            leading={<Icon name="twilight" />}
            trailing={<Switch label={t('Suivre le soleil')} checked={prefs.followSun} onChange={(followSun) => update({ followSun })} />}
          />
          {prefs.followSun && <PlacePicker place={prefs.place} weather={false} onChange={(place) => update({ place })} />}
          {sun && (
            <p className="option-hint option-hint--padded">
              {t('Aujourd’hui : lever {sunrise}, coucher {sunset}.', { sunrise: formatMinutes(sun.sunrise), sunset: formatMinutes(sun.sunset) })}
            </p>
          )}
          {TIME_SLOTS.map((slot) => {
            const anchor = SUN_ANCHORS[slot.key];
            const start = sun ? formatMinutes((anchor.anchor === 'sunrise' ? sun.sunrise : sun.sunset) + anchor.offset) : null;
            const label = t(slot.label);
            return (
              <RefRow
                key={slot.key}
                icon={slot.icon}
                label={label}
                wallpaperId={prefs.slots[slot.key]}
                onChoose={() => setPicking({ label, assign: (id) => update({ slots: { ...prefs.slots, [slot.key]: id } }) })}
                onClear={() => update({ slots: { ...prefs.slots, [slot.key]: undefined } })}
              >
                {prefs.followSun ? (
                  <span className="time-sun" title={t(anchor.label)} aria-label={t('Début : {slot}, {anchor}', { slot: label, anchor: t(anchor.label) })}>
                    {start ?? '—'}
                  </span>
                ) : (
                  <input
                    type="time"
                    className="time-input"
                    aria-label={t('Début : {slot}', { slot: label })}
                    value={prefs.slotStarts[slot.key]}
                    onChange={(e) => e.target.value && update({ slotStarts: { ...prefs.slotStarts, [slot.key]: e.target.value } })}
                  />
                )}
              </RefRow>
            );
          })}
        </>
      )}

      {prefs.mode === 'theme' && (
        <>
          <p className="option-hint option-hint--padded">
            {t('Le fond suit le thème clair ou sombre du téléphone, y compris quand il bascule tout seul le soir.')}
          </p>
          {(
            [
              ['light', 'Thème clair', 'lightMode'],
              ['dark', 'Thème sombre', 'darkMode'],
            ] as const
          ).map(([key, label, icon]) => (
            <RefRow
              key={key}
              icon={icon}
              label={t(label)}
              wallpaperId={prefs.theme[key]}
              onChoose={() => setPicking({ label: t(label), assign: (id) => update({ theme: { ...prefs.theme, [key]: id } }) })}
              onClear={() => update({ theme: { ...prefs.theme, [key]: undefined } })}
            />
          ))}
        </>
      )}

      {prefs.mode === 'weather' && (
        <>
          <PlacePicker place={prefs.place} onChange={(place) => update({ place })} />
          {WEATHER_KINDS.map((kind) => (
            <RefRow
              key={kind.key}
              icon={kind.icon}
              label={t(kind.label)}
              wallpaperId={prefs.weather[kind.key]}
              onChoose={() => setPicking({ label: t(kind.label), assign: (id) => update({ weather: { ...prefs.weather, [kind.key]: id } }) })}
              onClear={() => update({ weather: { ...prefs.weather, [kind.key]: undefined } })}
            />
          ))}
        </>
      )}

      {prefs.mode === 'season' && (
        <>
          <div className="option-block">
            <SegmentedButtons
              label={t('Hémisphère')}
              options={[
                { value: 'north', label: t('Hémisphère nord') },
                { value: 'south', label: t('Hémisphère sud') },
              ]}
              value={prefs.hemisphere}
              onChange={(hemisphere) => update({ hemisphere })}
            />
          </div>
          {SEASONS.map((season) => (
            <RefRow
              key={season.key}
              icon={season.icon}
              label={t(season.label)}
              wallpaperId={prefs.seasons[season.key]}
              onChoose={() => setPicking({ label: t(season.label), assign: (id) => update({ seasons: { ...prefs.seasons, [season.key]: id } }) })}
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
            label={t(level.label)}
            wallpaperId={prefs.battery[level.key]}
            onChoose={() => setPicking({ label: t(level.label), assign: (id) => update({ battery: { ...prefs.battery, [level.key]: id } }) })}
            onClear={() => update({ battery: { ...prefs.battery, [level.key]: undefined } })}
          />
        ))}

      <div className="option-block">
        <h2 className="option-block__title">{t('Écran')}</h2>
        <TargetChips value={prefs.target} onChange={(target) => update({ target })} />
      </div>
      <div className="option-actions">
        <Button variant="tonal" icon="refresh" disabled={!enabled || configuredCount === 0} onClick={() => void runNow()}>
          {t('Appliquer maintenant')}
        </Button>
      </div>

      <WallpaperPicker
        open={picking !== null}
        title={picking ? t('Fond « {label} »', { label: picking.label }) : ''}
        onClose={() => setPicking(null)}
        onPick={(w) => picking?.assign(w.id)}
      />
    </div>
  );
}

/** Libellés en français (données) : `t(label)` à l'affichage. */
const WEATHER_LABELS = Object.fromEntries(WEATHER_KINDS.map((k) => [k.key, k.label])) as Record<WeatherKey, string>;

/** Lieu de la météo ou du soleil : recherche de ville ou position approximative de l'appareil. */
export function PlacePicker({ place, onChange, weather = true }: { place: Place | null; onChange: (place: Place) => void; weather?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const current = useQuery({
    queryKey: ['weather-now', place?.latitude, place?.longitude],
    enabled: !!place && weather,
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
      showSnackbar(t('Recherche de ville impossible'));
    } finally {
      setSearching(false);
    }
  };

  const locate = async () => {
    try {
      const { latitude, longitude } = await PrismeAutomation.getApproximateLocation();
      // Nom gardé en français (donnée) : traduit à l'affichage, comme les autres noms que l'app donne elle-même.
      onChange({ name: 'Ma position', latitude, longitude });
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    }
  };

  return (
    <div className="option-block">
      <h2 className="option-block__title">{t('Lieu')}</h2>
      {place && (
        <ListItem
          headline={t(place.name)}
          supporting={
            !weather ? t('Lieu choisi') : current.data ? t('Actuellement : {weather}', { weather: t(WEATHER_LABELS[current.data]) }) : t('Météo Open-Meteo')
          }
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
        <TextField label={t('Ville')} value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
        <div className="option-actions">
          <Button type="submit" variant="tonal" icon="search" disabled={searching || query.trim().length < 2}>
            {t('Rechercher')}
          </Button>
          <Button variant="outlined" icon="explore" onClick={() => void locate()}>
            {t('Ma position')}
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
