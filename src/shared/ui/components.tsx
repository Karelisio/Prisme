import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from 'react';
import { ICONS, type IconName } from './icons';

export function Icon({ name, size, className }: { name: IconName; size?: number; className?: string }) {
  const style = size ? ({ '--icon-size': `${size}px` } as CSSProperties) : undefined;
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  large?: boolean;
}

export function Button({ variant = 'filled', icon, large, className, children, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', 'state', `btn--${variant}`, large && 'btn--large', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  variant?: 'standard' | 'filled' | 'tonal' | 'on-image';
  selected?: boolean;
}

/** Bouton icône ; `label` sert d'intitulé accessible (obligatoire). */
export function IconButton({ icon, label, variant = 'standard', selected, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = ['icon-btn', 'state', variant !== 'standard' && `icon-btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} aria-label={label} title={label} aria-pressed={selected} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Fab({ icon, children, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName }) {
  return (
    <button type={type} className={className ? `fab state ${className}` : 'fab state'} {...rest}>
      <Icon name={icon} />
      {children}
    </button>
  );
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: IconName;
  swatch?: string;
}

/** Puce de filtre : coche affichée quand elle est sélectionnée. */
export function Chip({ selected, icon, swatch, children, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} className={className ? `chip state ${className}` : 'chip state'} aria-pressed={!!selected} {...rest}>
      {swatch ? <span className="chip__swatch" style={{ background: swatch }} /> : null}
      {selected && !swatch ? <Icon name="check" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

export function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segmented__item state"
          onClick={() => onChange(option.value)}
        >
          {option.value === value ? <Icon name="check" /> : option.icon ? <Icon name={option.icon} /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function TextField({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="text-field">
      <label className="text-field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} {...rest} />
    </div>
  );
}

interface ListItemProps {
  headline: ReactNode;
  supporting?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function ListItem({ headline, supporting, leading, trailing, onClick, disabled }: ListItemProps) {
  const content = (
    <>
      {leading && <span className="list-item__leading">{leading}</span>}
      <span className="list-item__content">
        <span className="list-item__headline">{headline}</span>
        {supporting && <span className="list-item__supporting">{supporting}</span>}
      </span>
      {trailing && <span className="list-item__trailing">{trailing}</span>}
    </>
  );
  if (!onClick) return <div className="list-item">{content}</div>;
  return (
    <button type="button" className="list-item state" onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

export function Spinner({ size = 40, label = 'Chargement' }: { size?: number; label?: string }) {
  return (
    <svg className="spinner" viewBox="0 0 48 48" role="progressbar" aria-label={label} style={{ '--spinner-size': `${size}px` } as CSSProperties}>
      <circle cx="24" cy="24" r="20" />
    </svg>
  );
}

export function LinearProgress({ value, label = 'Progression' }: { value?: number; label?: string }) {
  const indeterminate = value === undefined;
  return (
    <div
      className={indeterminate ? 'linear-progress linear-progress--indeterminate' : 'linear-progress'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
    >
      <div className="linear-progress__bar" style={indeterminate ? undefined : { transform: `scaleX(${value})` }} />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <p className="empty-state__title">{title}</p>
      {text && <p className="empty-state__text">{text}</p>}
      {action}
    </div>
  );
}
