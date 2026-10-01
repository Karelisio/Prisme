import { useEffect, useState } from 'react';
import { COLOR_OPTIONS, RATIO_OPTIONS } from '@/features/sources/filters';
import { DEFAULT_FILTERS, type Filters } from '@/features/sources/types';
import { Button, Chip } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import { useBrowse } from './store';

export function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useBrowse((s) => s.filters);
  const setFilters = useBrowse((s) => s.setFilters);
  const [draft, setDraft] = useState<Filters>(current);

  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  const apply = () => {
    setFilters(draft);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Filtres">
      <section className="filter-section">
        <h3 className="filter-section__title">Couleur</h3>
        <div className="chip-wrap">
          {COLOR_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              swatch={option.swatch}
              selected={draft.color === option.value}
              onClick={() => setDraft((d) => ({ ...d, color: d.color === option.value ? null : option.value }))}
            >
              {option.label}
            </Chip>
          ))}
        </div>
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
