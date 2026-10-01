import { useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { Button, Icon, ListItem, TextField } from '@/shared/ui/components';
import { BottomSheet, showSnackbar } from '@/shared/ui/overlays';
import { useLibrary } from './store';

/** Ajout / retrait d'un fond dans les collections, avec création à la volée. */
export function CollectionsSheet({ wallpaper, open, onClose }: { wallpaper: Wallpaper; open: boolean; onClose: () => void }) {
  const collections = useLibrary((s) => s.collections);
  const setInCollection = useLibrary((s) => s.setInCollection);
  const createCollection = useLibrary((s) => s.createCollection);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createCollection(trimmed, wallpaper);
    showSnackbar(`Ajouté à « ${trimmed} »`);
    setName('');
    setCreating(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Ajouter à une collection">
      <ul className="list">
        {collections.map((c) => {
          const included = c.itemIds.includes(wallpaper.id);
          return (
            <li key={c.id}>
              <ListItem
                headline={c.name}
                supporting={`${c.itemIds.length} fond${c.itemIds.length > 1 ? 's' : ''}`}
                leading={<Icon name={included ? 'libraryAddCheck' : 'collections'} />}
                trailing={included ? <Icon name="check" /> : undefined}
                onClick={() => setInCollection(c.id, wallpaper, !included)}
              />
            </li>
          );
        })}
        {!creating && (
          <li>
            <ListItem headline="Nouvelle collection" leading={<Icon name="add" />} onClick={() => setCreating(true)} />
          </li>
        )}
      </ul>
      {creating && (
        <form
          className="sheet__form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <TextField label="Nom de la collection" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
          <div className="sheet__actions">
            <Button variant="text" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Créer
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
