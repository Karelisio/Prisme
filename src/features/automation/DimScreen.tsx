import { goBack } from '@/app/navigation';
import { useSettings } from '@/features/settings/store';
import { t } from '@/shared/i18n';
import { Chip, Icon, IconButton, Switch } from '@/shared/ui/components';
import { PlacePicker } from './DynamicScreen';
import { DEFAULT_AUTOMATION, DIM_STRENGTHS } from './model';
import { useAutomationPrefs } from './store';
import { formatMinutes, sunTimesOn } from './sun';

/** Options avancées › Assombrir le soir. */
export function DimScreen() {
  const stored = useAutomationPrefs((s) => s.dim);
  const dynamicPlace = useAutomationPrefs((s) => s.dynamic.place);
  const prefs = { ...DEFAULT_AUTOMATION.dim, ...stored };
  const update = useAutomationPrefs((s) => s.updateDim);
  const enabled = useSettings((s) => s.features.dim);
  const setFeature = useSettings((s) => s.setFeature);
  const place = prefs.place ?? dynamicPlace;
  const sun = place ? sunTimesOn(new Date(), place.latitude, place.longitude) : null;
  const max = DIM_STRENGTHS.find((s) => s.value === prefs.strength)?.max ?? 0.4;
  const sunset = sun ? formatMinutes(sun.sunset) : '21:00';
  const sunrise = sun ? formatMinutes(sun.sunrise) : '07:00';

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Assombrir le soir')}</h1>
        <Switch label={t('Activer l’assombrissement du soir')} checked={enabled} onChange={(v) => setFeature('dim', v)} />
      </header>
      <p className="option-intro">
        {t(
          'Après le coucher du soleil, les fonds posés par Prisme s’assombrissent doucement (pendant 1 h 30), puis retrouvent leur éclat avant le lever. Plus reposant pour les yeux, et plus économe sur écran OLED.',
        )}
      </p>

      {enabled && (
        <div className="option-status" role="status">
          <Icon name="night" />
          {sun
            ? t('Ce soir : à partir de {sunset}, jusqu’à {percent} % ; normal à {sunrise}', { sunset, percent: Math.round(max * 100), sunrise })
            : t('Ce soir : à partir de {sunset}, jusqu’à {percent} % ; normal à {sunrise} (heures par défaut : choisis ta ville)', {
                sunset,
                percent: Math.round(max * 100),
                sunrise,
              })}
        </div>
      )}

      <div className="option-block">
        <h2 className="option-block__title">{t('Intensité')}</h2>
        <div className="chip-wrap">
          {DIM_STRENGTHS.map((s) => (
            <Chip key={s.value} selected={prefs.strength === s.value} onClick={() => update({ strength: s.value })}>
              {t('{label} ({percent} %)', { label: t(s.label), percent: Math.round(s.max * 100) })}
            </Chip>
          ))}
        </div>
      </div>

      <PlacePicker place={place} weather={false} onChange={(p) => update({ place: p })} />
    </div>
  );
}
