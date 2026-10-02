import { PlacePicker } from '@/features/automation/DynamicScreen';
import { t } from '@/shared/i18n';
import type { LiveStatus } from '@/shared/native/automation';
import { Chip, Icon, ListItem, Switch } from '@/shared/ui/components';
import { useSceneSettings } from './live';
import { WEATHER_OVERLAY_DEFAULTS, WEATHER_PREVIEWS, type WeatherOverlaySettings, weatherOverlaySettings, weatherStatusText } from './motion';
import './motion.css';

/**
 * Météo animée par-dessus la photo : pluie, neige, brouillard ou orage selon la météo réelle du lieu
 * choisi, ou un aperçu immédiat. Réglages rangés avec ceux du genre photo (`scenes.image.weather`).
 */
export function WeatherOverlaySection({ status }: { status: LiveStatus | undefined }) {
  const [scene, updateScene] = useSceneSettings('image', { weather: WEATHER_OVERLAY_DEFAULTS });
  const weather = weatherOverlaySettings(scene.weather);
  const set = (patch: Partial<WeatherOverlaySettings>) => updateScene({ weather: { ...weather, ...patch } });
  const place =
    weather.latitude !== undefined && weather.longitude !== undefined
      ? { name: weather.name ?? 'Lieu choisi', latitude: weather.latitude, longitude: weather.longitude }
      : null;
  const text = weatherStatusText(weather, status?.weather, new Date());

  return (
    <section className="live-weather">
      <ListItem
        headline={t('Météo animée')}
        supporting={t('Pluie, neige, brouillard ou orage réels, par-dessus la photo')}
        leading={<Icon name="rainy" />}
        trailing={<Switch label={t('Météo animée')} checked={weather.enabled} onChange={(enabled) => set({ enabled })} />}
      />

      {weather.enabled && (
        <>
          <PlacePicker place={place} onChange={(p) => set({ latitude: p.latitude, longitude: p.longitude, name: p.name })} />
          {text && (
            <p className="option-hint option-hint--padded" role="status">
              {text}
            </p>
          )}

          <div className="option-block">
            <h2 className="option-block__title">{t('Aperçu')}</h2>
            <div className="chip-wrap" role="group" aria-label={t('Aperçu de la météo animée')}>
              {WEATHER_PREVIEWS.map((p) => (
                <Chip key={p.value} icon={p.icon} selected={weather.preview === p.value} onClick={() => set({ preview: p.value })}>
                  {t(p.label)}
                </Chip>
              ))}
            </div>
            <p className="option-hint">
              {t(
                '« Auto » suit la météo réelle, relevée au plus toutes les 30 minutes quand le fond est visible. Les autres choix montrent l’effet tout de suite.',
              )}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
