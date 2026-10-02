import { Icon, ListItem } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import type { LibrarySort } from './model';
import { SORT_OPTIONS } from './sort';

/** Choix du tri des favoris. */
export function SortSheet({ value, open, onClose, onChange }: { value: LibrarySort; open: boolean; onClose: () => void; onChange: (sort: LibrarySort) => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Trier les favoris">
      <ul className="list">
        {SORT_OPTIONS.map((option) => (
          <li key={option.value}>
            <ListItem
              headline={option.label}
              supporting={option.hint}
              trailing={option.value === value ? <Icon name="check" /> : undefined}
              onClick={() => {
                onChange(option.value);
                onClose();
              }}
            />
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
