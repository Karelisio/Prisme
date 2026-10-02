import { t } from '@/shared/i18n';
import { Chip, SegmentedButtons } from '@/shared/ui/components';
import { LiveActivateButton } from './LiveActivate';
import { PaletteTiles, useAccentSync } from './PaletteTiles';
import { activateLiveMode, useSceneSettings } from './live';
import type { ModeSectionProps } from './modes';
import { PARTICLES_DEFAULTS, PARTICLE_BACKGROUNDS, PARTICLE_COLORS, PARTICLE_STYLES, type ParticlesSettings } from './motion';

/** Libellés en français (données) : `t(label)` à l'affichage. */
const TOUCH_OPTIONS: readonly { value: ParticlesSettings['touch']; label: string }[] = [
  { value: 'repel', label: 'Repousser' },
  { value: 'attract', label: 'Attirer' },
];

/** Atténuation du fond « dégradé » sous les particules (comme le natif). */
const BACKGROUND_GAIN = 0.55;

/** Genre « Particules » : elles suivent l'inclinaison du téléphone et réagissent au doigt. */
export function ParticlesSection({ optionOn, status, refresh }: ModeSectionProps) {
  const [settings, update] = useSceneSettings('particles', PARTICLES_DEFAULTS);
  useAccentSync(settings.background === 'gradient' && settings.palette === 'system', settings.accent, update);

  return (
    <>
      <p className="option-hint option-hint--padded">
        {t(
          'Des particules qui suivent l’inclinaison du téléphone et réagissent quand tu touches l’écran d’accueil. Avec le double-tap, une gerbe d’étincelles jaillit au centre.',
        )}
      </p>

      <div className="option-block">
        <h2 className="option-block__title">{t('Style')}</h2>
        <div className="chip-wrap" role="group" aria-label={t('Style de particules')}>
          {PARTICLE_STYLES.map((s) => (
            <Chip key={s.value} icon={s.icon} selected={settings.style === s.value} onClick={() => update({ style: s.value })}>
              {t(s.label)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Densité')}</h2>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.density}
          aria-label={t('Densité des particules')}
          onChange={(e) => update({ density: Number(e.target.value) })}
        />
        <div className="live-scale">
          <span>{t('Clairsemées')}</span>
          <span>{t('Nombreuses')}</span>
        </div>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Toucher')}</h2>
        <SegmentedButtons
          label={t('Effet du toucher')}
          options={TOUCH_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
          value={settings.touch}
          onChange={(touch) => update({ touch })}
        />
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Fond')}</h2>
        <SegmentedButtons
          label={t('Fond des particules')}
          options={PARTICLE_BACKGROUNDS.map((option) => ({ ...option, label: t(option.label) }))}
          value={settings.background}
          onChange={(background) => update({ background })}
        />
        {settings.background === 'photo' && (
          <p className="option-hint">
            {status?.configured
              ? t('L’image du genre Photo, légèrement assombrie.')
              : t('Choisis d’abord une image dans le genre Photo ; en attendant, le dégradé est affiché.')}
          </p>
        )}
      </div>

      {settings.background === 'gradient' && (
        <div className="option-block">
          <h2 className="option-block__title">{t('Palette du fond')}</h2>
          <PaletteTiles label={t('Palette du fond')} value={settings.palette} gain={BACKGROUND_GAIN} onChange={(palette) => update({ palette })} />
        </div>
      )}

      {settings.background === 'color' && (
        <div className="option-block">
          <h2 className="option-block__title">{t('Couleur du fond')}</h2>
          <div className="chip-wrap" role="group" aria-label={t('Couleur du fond')}>
            {PARTICLE_COLORS.map((c) => (
              <Chip key={c.value} swatch={c.value} selected={settings.color === c.value} onClick={() => update({ color: c.value })}>
                {t(c.label)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <LiveActivateButton status={status} disabled={!optionOn} refresh={refresh} onActivate={() => activateLiveMode('particles')} />
    </>
  );
}
