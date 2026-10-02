import type { CSSProperties, ReactNode } from 'react';
import type { GridLayout, ThemeMode } from './store';
import './pickers.css';

interface CardOption<T extends string> {
  value: T;
  label: string;
  /** Dessin de l'option (décoratif : le libellé suffit aux lecteurs d'écran). */
  preview: ReactNode;
}

/** Choix unique présenté en cartes illustrées (groupe de boutons radio). */
export function OptionCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly CardOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="option-cards" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="option-card state"
          onClick={() => onChange(option.value)}
        >
          <span className="option-card__preview" aria-hidden="true">
            {option.preview}
          </span>
          <span className="option-card__label">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Apparences proposées ; « Noir » est le thème sombre à fonds noirs purs. */
const THEME_LABELS: Record<ThemeMode, string> = { system: 'Auto', light: 'Clair', dark: 'Sombre', black: 'Noir' };
const THEME_ORDER: readonly ThemeMode[] = ['system', 'light', 'dark', 'black'];

/** Mini écran aux couleurs d'un thème : barre d'accent et quatre vignettes. */
function ThemeMini({ mode, style }: { mode: 'light' | 'dark' | 'black'; style?: CSSProperties }) {
  return (
    <span className="theme-mini" data-mode={mode} style={style}>
      <span className="theme-mini__bar" />
      <span className="theme-mini__tiles">
        <span />
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  if (mode !== 'system') return <ThemeMini mode={mode} />;
  // Auto : moitié clair, moitié sombre.
  return (
    <>
      <ThemeMini mode="light" />
      <ThemeMini mode="dark" style={{ clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 30% 100%)' }} />
    </>
  );
}

const THEME_OPTIONS = THEME_ORDER.map((value) => ({ value, label: THEME_LABELS[value], preview: <ThemePreview mode={value} /> }));

export function ThemePicker({ value, onChange }: { value: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return <OptionCards label="Thème" options={THEME_OPTIONS} value={value} onChange={onChange} />;
}

/** Mini galerie : `columns` colonnes égales, ou deux colonnes de hauteurs variées pour la mosaïque. */
function GridMini({ layout }: { layout: GridLayout }) {
  if (layout === 'mosaic') {
    return (
      <span className="grid-mini grid-mini--mosaic">
        <span>
          <i style={{ flex: 3 }} />
          <i style={{ flex: 2 }} />
        </span>
        <span>
          <i style={{ flex: 2 }} />
          <i style={{ flex: 3 }} />
        </span>
      </span>
    );
  }
  const columns = Number(layout);
  return (
    <span className="grid-mini" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

const GRID_LABELS: Record<GridLayout, string> = { '2': '2 colonnes', '3': '3 colonnes', '4': '4 colonnes', mosaic: 'Mosaïque' };
const GRID_ORDER: readonly GridLayout[] = ['2', '3', '4', 'mosaic'];

const GRID_OPTIONS = GRID_ORDER.map((value) => ({ value, label: GRID_LABELS[value], preview: <GridMini layout={value} /> }));

export function GridPicker({ value, onChange }: { value: GridLayout; onChange: (layout: GridLayout) => void }) {
  return <OptionCards label="Disposition de la grille" options={GRID_OPTIONS} value={value} onChange={onChange} />;
}
