import { type RefObject, useMemo, useRef, useState } from 'react';
import { openPreview, useNavigation } from '@/app/navigation';
import { WallpaperGrid } from '@/features/browse/WallpaperGrid';
import { importAndPreview } from '@/features/browse/importAction';
import type { Wallpaper } from '@/features/sources/types';
import { TARGET_LABELS, undoLastApply } from '@/features/preview/applyWallpaper';
import { haptic } from '@/shared/lib/haptics';
import { nativeErrorMessage } from '@/shared/native';
import { Button, EmptyState, Fab, Icon, IconButton, ListItem, SegmentedButtons, TextField } from '@/shared/ui/components';
import { Dialog, showSnackbar } from '@/shared/ui/overlays';
import type { Collection, HistoryEntry } from './model';
import { useLibrary } from './store';
import { useThumbSrc } from './useImageSrc';
import './library.css';

type Section = 'favorites' | 'collections' | 'history';

const SECTIONS = [
  { value: 'favorites', label: 'Favoris', icon: 'favorite' },
  { value: 'collections', label: 'Collections', icon: 'collections' },
  { value: 'history', label: 'Historique', icon: 'history' },
] as const;

export function LibraryScreen() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section>('favorites');
  const [confirmClear, setConfirmClear] = useState(false);
  const historyCount = useLibrary((s) => s.history.length);
  const clearHistory = useLibrary((s) => s.clearHistory);

  return (
    <div ref={scrollRef} className="screen screen--tab">
      <header className="top-bar">
        <h1 className="top-bar__title">Bibliothèque</h1>
        {section === 'history' && historyCount > 0 && (
          <IconButton icon="delete" label="Effacer l'historique" onClick={() => setConfirmClear(true)} />
        )}
      </header>
      <div className="library-tabs">
        <SegmentedButtons label="Section" options={SECTIONS} value={section} onChange={setSection} />
      </div>
      {section === 'favorites' && <Favorites scrollRef={scrollRef} />}
      {section === 'collections' && <Collections />}
      {section === 'history' && <History />}
      <Fab icon="addPhoto" className="library-fab" onClick={() => void importAndPreview()}>
        Importer
      </Fab>
      <Dialog
        open={confirmClear}
        title="Effacer l'historique ?"
        confirmLabel="Effacer"
        onConfirm={() => {
          clearHistory();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      >
        Les fonds déjà appliqués ne changent pas.
      </Dialog>
    </div>
  );
}

function Favorites({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  const list = useMemo(
    () =>
      Object.entries(favorites)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => items[id])
        .filter((w): w is Wallpaper => !!w),
    [favorites, items],
  );
  if (list.length === 0) {
    return <EmptyState icon="favorite" title="Aucun favori" text="Touche le cœur dans l'aperçu d'un fond pour le retrouver ici, même hors ligne." />;
  }
  return <WallpaperGrid items={list} scrollRef={scrollRef} />;
}

function Collections() {
  const collections = useLibrary((s) => s.collections);
  const createCollection = useLibrary((s) => s.createCollection);
  const push = useNavigation((s) => s.push);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <div className="library-actions">
        <Button variant="tonal" icon="add" onClick={() => setCreating(true)}>
          Nouvelle collection
        </Button>
      </div>
      {collections.length === 0 ? (
        <EmptyState icon="collections" title="Aucune collection" text="Regroupe tes fonds par thème : plages, nuit, minimal…" />
      ) : (
        <div className="collection-grid">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} onOpen={() => push({ type: 'collection', collectionId: c.id })} />
          ))}
        </div>
      )}
      <Dialog
        open={creating}
        title="Nouvelle collection"
        confirmLabel="Créer"
        confirmDisabled={!name.trim()}
        onConfirm={() => {
          createCollection(name);
          setName('');
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      >
        <TextField label="Nom" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Dialog>
    </>
  );
}

function CollectionCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const items = useLibrary((s) => s.items);
  const covers = collection.itemIds
    .slice(0, 3)
    .map((id) => items[id])
    .filter((w): w is Wallpaper => !!w);
  return (
    <button type="button" className="collection-card state" onClick={onOpen}>
      <span className="collection-card__covers">
        {covers.length === 0 ? <Icon name="collections" size={32} /> : covers.map((w) => <CoverImage key={w.id} wallpaper={w} />)}
      </span>
      <span className="collection-card__name">{collection.name}</span>
      <span className="collection-card__count">
        {collection.itemIds.length} fond{collection.itemIds.length > 1 ? 's' : ''}
      </span>
    </button>
  );
}

function CoverImage({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img src={src} alt="" loading="lazy" decoding="async" style={{ backgroundColor: wallpaper.color }} />;
}

async function restorePrevious() {
  try {
    const message = await undoLastApply();
    haptic('confirm');
    showSnackbar(message);
  } catch (error) {
    haptic('reject');
    showSnackbar(`Échec : ${nativeErrorMessage(error)}`);
  }
}

function History() {
  const history = useLibrary((s) => s.history);
  const items = useLibrary((s) => s.items);
  const groups = useMemo(() => groupByDay(history), [history]);
  const [restoring, setRestoring] = useState(false);
  if (history.length === 0) {
    return <EmptyState icon="history" title="Historique vide" text="Les fonds que tu appliques apparaîtront ici." />;
  }
  return (
    <div className="history">
      {history.length > 1 && (
        <div className="history__actions">
          <Button
            variant="tonal"
            icon="undo"
            disabled={restoring}
            onClick={() => {
              setRestoring(true);
              void restorePrevious().finally(() => setRestoring(false));
            }}
          >
            Revenir au fond précédent
          </Button>
        </div>
      )}
      {groups.map(([day, entries]) => (
        <section key={day}>
          <h2 className="list-subheader">{day}</h2>
          <ul className="list">
            {entries.map((entry) => {
              const w = items[entry.wallpaperId];
              if (!w) return null;
              return (
                <li key={entry.id}>
                  <ListItem
                    leading={<HistoryThumb wallpaper={w} />}
                    headline={TARGET_LABELS[entry.target]}
                    supporting={`${new Date(entry.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${
                      w.author ? ` · ${w.author.name}` : ''
                    }${entry.auto ? ' · automatique' : ''}`}
                    onClick={() => openPreview(w)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HistoryThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img className="history__thumb" src={src} alt="" loading="lazy" style={{ backgroundColor: wallpaper.color }} />;
}

export function groupByDay(entries: HistoryEntry[], now = new Date()): [string, HistoryEntry[]][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.at);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const label =
      day === today
        ? "Aujourd'hui"
        : day === today - 86_400_000
          ? 'Hier'
          : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return [...groups.entries()];
}
