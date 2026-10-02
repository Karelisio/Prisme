import { t } from '@/shared/i18n';
import { Chip } from '@/shared/ui/components';
import { Slider } from './controls';
import { EFFECTS, type EffectParams } from './effects';

/** Effets artistiques : pixel art, mosaïque, trame, peinture. */
export function EffectPanel({ effect, onChange }: { effect: EffectParams; onChange: (effect: EffectParams) => void }) {
  const current = EFFECTS.find((e) => e.kind === effect.kind);
  return (
    <>
      <div className="chip-wrap" role="group" aria-label={t('Effets artistiques')}>
        {EFFECTS.map((e) => (
          <Chip key={e.kind} selected={effect.kind === e.kind} onClick={() => onChange({ ...effect, kind: e.kind })}>
            {t(e.label)}
          </Chip>
        ))}
      </div>
      {current && current.kind !== 'none' && <Slider label={t(current.control)} value={effect.amount} onChange={(amount) => onChange({ ...effect, amount })} />}
    </>
  );
}
