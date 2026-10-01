import { useMemo, useRef, useState } from 'react';
import { goBack } from '@/app/navigation';
import { WallpaperGrid } from '@/features/browse/WallpaperGrid';
import type { Wallpaper } from '@/features/sources/types';
import { EmptyState, IconButton, TextField } from '@/shared/ui/components';
import { Dialog } from '@/shared/ui/overlays';
import { useLibrary } from './store';

export function CollectionScreen({ collectionId }: { collectionId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const collection = useLibrary((s) => s.collections.find((c) => c.id === collectionId));
  const items = useLibrary((s) => s.items);
  const renameCollection = useLibrary((s) => s.renameCollection);
  const deleteCollection = useLibrary((s) => s.deleteCollection);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const list = useMemo(
    () => (collection?.itemIds ?? []).map((id) => items[id]).filter((w): w is Wallpaper => !!w),
    [collection, items],
  );

  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">{collection?.name ?? 'Collection'}</h1>
        {collection && (
          <>
            <IconButton
              icon="edit"
              label="Renommer"
              onClick={() => {
                setName(collection.name);
                setDialog('rename');
              }}
            />
            <IconButton icon="delete" label="Supprimer la collection" onClick={() => setDialog('delete')} />
          </>
        )}
      </header>
      {list.length === 0 ? (
        <EmptyState icon="collections" title="Collection vide" text="Ajoute des fonds depuis leur aperçu." />
      ) : (
        <WallpaperGrid items={list} scrollRef={scrollRef} />
      )}
      <Dialog
        open={dialog === 'rename'}
        title="Renommer"
        confirmLabel="Enregistrer"
        confirmDisabled={!name.trim()}
        onConfirm={() => {
          renameCollection(collectionId, name);
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      >
        <TextField label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Dialog>
      <Dialog
        open={dialog === 'delete'}
        title="Supprimer la collection ?"
        confirmLabel="Supprimer"
        onConfirm={() => {
          setDialog(null);
          goBack();
          deleteCollection(collectionId);
        }}
        onCancel={() => setDialog(null)}
      >
        Les fonds restent dans tes favoris et ton historique.
      </Dialog>
    </div>
  );
}
