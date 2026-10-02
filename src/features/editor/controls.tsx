/** Commandes partagées par les panneaux de l'éditeur. */

const SWATCHES = ['#000000', '#ffffff', '#1b1530', '#6750a4', '#0061a4', '#9c4146', '#386a20', '#f5c26b'];

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  valueText,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Valeur lisible à droite du titre (« +3,5° », « ×2,0 »). */
  valueText?: string;
  disabled?: boolean;
}) {
  return (
    <label className="editor__slider">
      {valueText ? (
        <span className="editor__slider-head">
          <span>{label}</span>
          <span className="editor__slider-value">{valueText}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={valueText}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export interface SwatchOption {
  /** Identifiant du choix (en général la couleur elle-même). */
  value: string;
  label: string;
  /** Couleur affichée, si elle diffère de `value` (choix « automatique »). */
  color?: string;
}

const DEFAULT_SWATCHES: readonly SwatchOption[] = SWATCHES.map((c) => ({ value: c, label: c }));

/** Pastilles de couleur à choix unique ; `value` null : aucune n'est cochée. */
export function Swatches({
  value,
  onChange,
  label,
  options = DEFAULT_SWATCHES,
}: {
  value: string | null;
  onChange: (c: string) => void;
  label: string;
  options?: readonly SwatchOption[];
}) {
  return (
    <div className="editor__swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={`${o.label}:${o.value}`}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          title={o.label}
          className="seed seed--small"
          style={{ background: o.color ?? o.value }}
          onClick={() => onChange(o.value)}
        />
      ))}
    </div>
  );
}
