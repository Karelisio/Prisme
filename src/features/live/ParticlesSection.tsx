import { Chip, SegmentedButtons } from '@/shared/ui/components';
import { LiveActivateButton } from './LiveActivate';
import { PaletteTiles, useAccentSync } from './PaletteTiles';
import { activateLiveMode, useSceneSettings } from './live';
import type { ModeSectionProps } from './modes';
import { PARTICLES_DEFAULTS, PARTICLE_BACKGROUNDS, PARTICLE_COLORS, PARTICLE_STYLES, type ParticlesSettings } from './motion';

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
        Des particules qui suivent l’inclinaison du téléphone et réagissent quand tu touches l’écran d’accueil. Avec le
        double-tap, une gerbe d’étincelles jaillit au centre.
      </p>

      <div className="option-block">
        <h2 className="option-block__title">Style</h2>
        <div className="chip-wrap" role="group" aria-label="Style de particules">
          {PARTICLE_STYLES.map((s) => (
            <Chip key={s.value} icon={s.icon} selected={settings.style === s.value} onClick={() => update({ style: s.value })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Densité</h2>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.density}
          aria-label="Densité des particules"
          onChange={(e) => update({ density: Number(e.target.value) })}
        />
        <div className="live-scale">
          <span>Clairsemées</span>
          <span>Nombreuses</span>
        </div>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Toucher</h2>
        <SegmentedButtons label="Effet du toucher" options={TOUCH_OPTIONS} value={settings.touch} onChange={(touch) => update({ touch })} />
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Fond</h2>
        <SegmentedButtons label="Fond des particules" options={PARTICLE_BACKGROUNDS} value={settings.background} onChange={(background) => update({ background })} />
        {settings.background === 'photo' && (
          <p className="option-hint">
            {status?.configured
              ? 'L’image du genre Photo, légèrement assombrie.'
              : 'Choisis d’abord une image dans le genre Photo ; en attendant, le dégradé est affiché.'}
          </p>
        )}
      </div>

      {settings.background === 'gradient' && (
        <div className="option-block">
          <h2 className="option-block__title">Palette du fond</h2>
          <PaletteTiles label="Palette du fond" value={settings.palette} gain={BACKGROUND_GAIN} onChange={(palette) => update({ palette })} />
        </div>
      )}

      {settings.background === 'color' && (
        <div className="option-block">
          <h2 className="option-block__title">Couleur du fond</h2>
          <div className="chip-wrap" role="group" aria-label="Couleur du fond">
            {PARTICLE_COLORS.map((c) => (
              <Chip key={c.value} swatch={c.value} selected={settings.color === c.value} onClick={() => update({ color: c.value })}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <LiveActivateButton status={status} disabled={!optionOn} refresh={refresh} onActivate={() => activateLiveMode('particles')} />
    </>
  );
}
