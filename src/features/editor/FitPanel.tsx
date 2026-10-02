import { t } from '@/shared/i18n';
import { Chip } from '@/shared/ui/components';
import { type SwatchOption, Swatches } from './controls';
import { FIT_MODES, type FitParams } from './fit';

const AUTO = 'auto';

/** Ajustement de la photo dans l'écran : remplir, ou photo entière sur bords flous / unis. */
export function FitPanel({
  fit,
  palette,
  landscape,
  onChange,
}: {
  fit: FitParams;
  /** Couleurs dominantes de la photo, de la plus présente à la moins présente. */
  palette: readonly string[];
  landscape: boolean;
  onChange: (fit: FitParams) => void;
}) {
  const dominant = palette[0] ?? '#000000';
  const options: SwatchOption[] = [
    { value: AUTO, label: t('Couleur dominante'), color: dominant },
    ...palette.slice(1).map((color, i) => ({ value: color, label: t('Autre couleur de la photo {n}', { n: i + 1 }) })),
    { value: '#000000', label: t('Noir') },
    { value: '#ffffff', label: t('Blanc') },
  ];
  return (
    <>
      <div className="chip-wrap" role="group" aria-label={t('Ajustement de la photo')}>
        {FIT_MODES.map((m) => (
          <Chip key={m.mode} selected={fit.mode === m.mode} onClick={() => onChange({ ...fit, mode: m.mode })}>
            {t(m.label)}
          </Chip>
        ))}
      </div>
      {fit.mode === 'color' && (
        <div className="editor__row">
          <Swatches label={t('Couleur des bords')} value={fit.color ?? AUTO} options={options} onChange={(c) => onChange({ ...fit, color: c === AUTO ? null : c })} />
          <input
            type="color"
            className="editor__color"
            aria-label={t('Couleur personnalisée')}
            value={fit.color ?? dominant}
            onChange={(e) => onChange({ ...fit, color: e.target.value })}
          />
        </div>
      )}
      {landscape && fit.mode === 'fill' && <p className="editor__hint">{t('Photo en paysage : tu peux l’afficher en entier, sans la rogner.')}</p>}
    </>
  );
}
