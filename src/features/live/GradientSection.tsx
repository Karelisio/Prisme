import { t } from '@/shared/i18n';
import { Icon, ListItem, SegmentedButtons, Switch } from '@/shared/ui/components';
import { LiveActivateButton } from './LiveActivate';
import { PaletteTiles, useAccentSync } from './PaletteTiles';
import { activateLiveMode, useSceneSettings } from './live';
import type { ModeSectionProps } from './modes';
import { GRADIENT_DEFAULTS, GRADIENT_SPEEDS } from './motion';

/** Genre « Dégradé » : des couleurs qui ondulent lentement, façon aurore boréale. */
export function GradientSection({ optionOn, status, refresh }: ModeSectionProps) {
  const [settings, update] = useSceneSettings('gradient', GRADIENT_DEFAULTS);
  useAccentSync(settings.palette === 'system', settings.accent, update);

  return (
    <>
      <p className="option-hint option-hint--padded">
        {t('Des couleurs qui ondulent lentement, façon aurore boréale. Avec le double-tap, le fond passe à la palette suivante.')}
      </p>

      <div className="option-block">
        <h2 className="option-block__title">{t('Palette')}</h2>
        <PaletteTiles label={t('Palette du dégradé')} value={settings.palette} onChange={(palette) => update({ palette })} />
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Vitesse')}</h2>
        <SegmentedButtons
          label={t('Vitesse du dégradé')}
          options={GRADIENT_SPEEDS.map((speed) => ({ ...speed, label: t(speed.label) }))}
          value={settings.speed}
          onChange={(speed) => update({ speed })}
        />
      </div>

      <ListItem
        headline={t('Grain léger')}
        supporting={t('Évite les bandes de couleur dans les dégradés sombres')}
        leading={<Icon name="grain" />}
        trailing={<Switch label={t('Grain léger')} checked={settings.grain} onChange={(grain) => update({ grain })} />}
      />

      <LiveActivateButton status={status} disabled={!optionOn} refresh={refresh} onActivate={() => activateLiveMode('gradient')} />
    </>
  );
}
