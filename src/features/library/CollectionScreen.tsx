import { useMemo, useRef, useState } from 'react';
import { goBack } from '@/app/navigation';
import { WallpaperGrid } from '@/features/browse/WallpaperGrid';
import type { Wallpaper } from '@/features/sources/types';
import { EmptyState, IconButton, TextField } from '@/shared/ui/components';
import { Dialog } from '@/shared/ui/overlays';
import { ShareSheet } from './ShareSheet';
import { useLibrary } from './store';
import { useAutoCollection } from './useAutoCollections';
import './library.css';

const NO_IDS: string[] = [];

/** Collection de l'utilisateur (modifiable) ou collection automatique (calculée, en lecture seule). */
export function CollectionScreen({ collectionId }: { collectionId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const collection = useLibrary((s) => s.collections.find((c) => c.id === collectionId));
  const auto = useAutoCollection(collectionId);
  const items = useLibrary((s) => s.items);
  const renameCollection = useLibrary((s) => s.renameCollection);
  const deleteCollection = useLibrary((s) => s.deleteCollection);
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'share' | null>(null);
  const [name, setName] = useState('');
  const title = collection?.name ?? auto?.name ?? 'Collection';
  const ids = collection?.itemIds ?? auto?.ids ?? NO_IDS;
  const list = useMemo(() => ids.map((id) => items[id]).filter((w): w is Wallpaper => !!w), [ids, items]);

  return (
    <div ref={scrollRef} className="screen overlay-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">{title}</h1>
        {(collection || auto) && <IconButton icon="share" label="Partager la collection" onClick={() => setDialog('share')} />}
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
      {auto && <p className="collection-hint">Collection automatique : {auto.hint.toLowerCase()}. Elle se met à jour toute seule.</p>}
      {list.length === 0 ? (
        collection ? (
          <EmptyState icon="collections" title="Collection vide" text="Ajoute des fonds depuis leur aperçu." />
        ) : (
          <EmptyState icon="collections" title="Rien ici pour le moment" text="Cette collection automatique se remplit toute seule." />
        )
      ) : (
        <WallpaperGrid items={list} scrollRef={scrollRef} />
      )}
      <ShareSheet name={title} wallpapers={list} open={dialog === 'share'} onClose={() => setDialog(null)} />
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
