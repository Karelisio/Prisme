import { useEffect, useState } from 'react';
import { COLOR_OPTIONS, RATIO_OPTIONS, SHADES, brightness, colorLabel, isHexColor } from '@/features/sources/filters';
import { type ColorChoice, DEFAULT_FILTERS, type Filters } from '@/features/sources/types';
import { Button, Chip, Icon, ListItem, Switch } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import { useBrowse } from './store';

export function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useBrowse((s) => s.filters);
  const setFilters = useBrowse((s) => s.setFilters);
  const [draft, setDraft] = useState<Filters>(current);
  const [shadesOpen, setShadesOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(current);
    setShadesOpen(current.color !== null && isHexColor(current.color));
  }, [open, current]);

  const apply = () => {
    setFilters(draft);
    onClose();
  };

  // Couleur et AMOLED s'excluent : un fond très sombre n'a pas de teinte marquée.
  const pickColor = (color: ColorChoice) => setDraft((d) => ({ ...d, color: d.color === color ? null : color, amoled: false }));
  const hex = draft.color !== null && isHexColor(draft.color) ? draft.color : null;

  return (
    <BottomSheet open={open} onClose={onClose} title="Filtres">
      <section className="filter-section">
        <h3 className="filter-section__title">Couleur</h3>
        <div className="chip-wrap">
          {COLOR_OPTIONS.map((option) => (
            <Chip key={option.value} swatch={option.swatch} selected={draft.color === option.value} onClick={() => pickColor(option.value)}>
              {option.label}
            </Chip>
          ))}
          <Chip icon="palette" selected={shadesOpen} aria-expanded={shadesOpen} onClick={() => setShadesOpen((o) => !o)}>
            Nuancier
          </Chip>
        </div>
        {shadesOpen && (
          <>
            <div className="shades" role="radiogroup" aria-label="Nuancier">
              {SHADES.map((shade) => (
                <button
                  key={shade}
                  type="button"
                  role="radio"
                  className="shade"
                  aria-checked={draft.color === shade}
                  aria-label={colorLabel(shade)}
                  style={{ background: shade, color: brightness(shade) > 0.6 ? '#000' : '#fff' }}
                  onClick={() => pickColor(shade)}
                >
                  {draft.color === shade && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
            <p className="shades__value">{hex ? colorLabel(hex) : 'Touche une teinte pour la choisir'}</p>
          </>
        )}
      </section>
      <section className="filter-section filter-section--flush">
        <ListItem
          headline="AMOLED"
          supporting="Fonds très sombres aux noirs profonds, économes sur écran OLED"
          leading={<Icon name="darkMode" />}
          trailing={
            <Switch
              label="AMOLED"
              checked={draft.amoled}
              onChange={(amoled) => setDraft((d) => ({ ...d, amoled, color: amoled ? null : d.color }))}
            />
          }
        />
      </section>
      <section className="filter-section">
        <h3 className="filter-section__title">Format</h3>
        <div className="chip-wrap">
          {RATIO_OPTIONS.map((option) => (
            <Chip key={option.value} selected={draft.ratio === option.value} onClick={() => setDraft((d) => ({ ...d, ratio: option.value }))}>
              {option.label}
            </Chip>
          ))}
        </div>
      </section>
      <div className="sheet__actions">
        <Button variant="text" onClick={() => setDraft(DEFAULT_FILTERS)}>
          Réinitialiser
        </Button>
        <Button onClick={apply}>Appliquer</Button>
      </div>
    </BottomSheet>
  );
}
