import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { openPreview, useNavigation } from '@/app/navigation';
import { WallpaperGrid } from '@/features/browse/WallpaperGrid';
import { importAndPreview } from '@/features/browse/importAction';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { TARGET_LABELS, undoLastApply } from '@/features/preview/applyWallpaper';
import { locale, t, tn } from '@/shared/i18n';
import { haptic } from '@/shared/lib/haptics';
import { nativeErrorMessage } from '@/shared/native';
import { Button, Chip, EmptyState, Fab, Icon, IconButton, ListItem, SegmentedButtons, TextField } from '@/shared/ui/components';
import { Dialog, showSnackbar } from '@/shared/ui/overlays';
import { PasteCodeDialog } from './PasteCodeDialog';
import { SortSheet } from './SortSheet';
import { TagsSheet } from './TagsSheet';
import { type HistoryEntry, hasTag, sameTag, tagCounts } from './model';
import { scanAndOpen } from './receive';
import { sortFavorites, sortLabel } from './sort';
import { useLibrary } from './store';
import { useAutoCollections } from './useAutoCollections';
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
  const push = useNavigation((s) => s.push);

  return (
    <div ref={scrollRef} className="screen screen--tab">
      <header className="top-bar">
        <h1 className="top-bar__title">{t('Bibliothèque')}</h1>
        <IconButton icon="barChart" label={t('Statistiques')} onClick={() => push({ type: 'stats' })} />
        {section === 'history' && historyCount > 0 && (
          <IconButton icon="delete" label={t("Effacer l'historique")} onClick={() => setConfirmClear(true)} />
        )}
      </header>
      <div className="library-tabs">
        <SegmentedButtons label={t('Section')} options={SECTIONS.map((s) => ({ ...s, label: t(s.label) }))} value={section} onChange={setSection} />
      </div>
      {section === 'favorites' && <Favorites scrollRef={scrollRef} />}
      {section === 'collections' && <Collections />}
      {section === 'history' && <History />}
      <Fab icon="addPhoto" className="library-fab" onClick={() => void importAndPreview()}>
        {t('Importer')}
      </Fab>
      <Dialog
        open={confirmClear}
        title={t("Effacer l'historique ?")}
        confirmLabel={t('Effacer')}
        onConfirm={() => {
          clearHistory();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      >
        {t('Les fonds déjà appliqués ne changent pas.')}
      </Dialog>
    </div>
  );
}

function Favorites({ scrollRef }: { scrollRef: RefObject<HTMLDivElement | null> }) {
  const favorites = useLibrary((s) => s.favorites);
  const items = useLibrary((s) => s.items);
  // Le collage s'active avec le générateur (même option avancée que la puce « Créer »).
  const collageEnabled = useSettings((s) => s.features.generator);
  const push = useNavigation((s) => s.push);
  const tags = useLibrary((s) => s.tags);
  const sort = useLibrary((s) => s.sort);
  const setSort = useLibrary((s) => s.setSort);
  const [filter, setFilter] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const [tagging, setTagging] = useState<Wallpaper | null>(null);
  const counts = useMemo(() => tagCounts({ tags, favorites }), [tags, favorites]);
  // Une étiquette dont plus aucun fond ne dépend ne filtre plus rien.
  const active = filter !== null && counts.some((c) => sameTag(c.tag, filter)) ? filter : null;
  const list = useMemo(
    () =>
      sortFavorites(
        Object.entries(favorites).flatMap(([id, addedAt]) => {
          const wallpaper = items[id];
          return wallpaper && (active === null || hasTag({ tags }, id, active)) ? [{ wallpaper, addedAt }] : [];
        }),
        sort,
      ),
    [favorites, items, tags, active, sort],
  );
  const onLongPress = useCallback((w: Wallpaper) => setTagging(w), []);
  if (Object.keys(favorites).length === 0) {
    return <EmptyState icon="favorite" title={t('Aucun favori')} text={t("Touche le cœur dans l'aperçu d'un fond pour le retrouver ici, même hors ligne.")} />;
  }
  return (
    <>
      <div className="library-toolbar">
        <Button variant="text" icon="sort" onClick={() => setSorting(true)}>
          {t('Tri : {sort}', { sort: sortLabel(sort).toLowerCase() })}
        </Button>
      </div>
      {counts.length > 0 && (
        <div className="library-chips" role="group" aria-label={t('Filtrer par étiquette')}>
          {counts.map(({ tag, count }) => (
            <Chip
              key={tag}
              selected={active !== null && sameTag(active, tag)}
              aria-label={`${tag}, ${tn(count, '{count} fond', '{count} fonds')}`}
              onClick={() => setFilter(active !== null && sameTag(active, tag) ? null : tag)}
            >
              {tag}
              <span className="chip__count">{count}</span>
            </Chip>
          ))}
        </div>
      )}
      {collageEnabled && list.length >= 2 && (
        <div className="library-actions">
          <Button variant="tonal" icon="collage" onClick={() => push({ type: 'collage', wallpapers: list.slice(0, 4) })}>
            {t('Collage avec mes favoris')}
          </Button>
        </div>
      )}
      <WallpaperGrid items={list} scrollRef={scrollRef} onLongPress={onLongPress} />
      <SortSheet value={sort} open={sorting} onClose={() => setSorting(false)} onChange={setSort} />
      <TagsSheet wallpaper={tagging} open={tagging !== null} onClose={() => setTagging(null)} />
    </>
  );
}

function Collections() {
  const collections = useLibrary((s) => s.collections);
  const createCollection = useLibrary((s) => s.createCollection);
  const auto = useAutoCollections();
  const push = useNavigation((s) => s.push);
  const [creating, setCreating] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <div className="library-actions">
        <Button variant="tonal" icon="add" onClick={() => setCreating(true)}>
          {t('Nouvelle collection')}
        </Button>
        <Button variant="tonal" icon="contentPaste" onClick={() => setPasting(true)}>
          {t('Coller un code')}
        </Button>
        <Button variant="tonal" icon="qrScanner" onClick={() => void scanAndOpen()}>
          {t('Scanner un QR')}
        </Button>
      </div>
      {collections.length === 0 ? (
        <EmptyState
          icon="collections"
          title={t('Aucune collection')}
          text={t("Regroupe tes fonds par thème : plages, nuit, minimal… ou ajoute celle d'un ami avec un code.")}
        />
      ) : (
        <div className="collection-grid">
          {collections.map((c) => (
            <CollectionCard key={c.id} name={c.name} ids={c.itemIds} onOpen={() => push({ type: 'collection', collectionId: c.id })} />
          ))}
        </div>
      )}
      {auto.length > 0 && (
        <section aria-labelledby="auto-collections">
          <h2 id="auto-collections" className="list-subheader">
            {t('Collections automatiques')}
          </h2>
          <div className="collection-grid">
            {auto.map((c) => (
              <CollectionCard key={c.id} name={c.name} ids={c.ids} onOpen={() => push({ type: 'collection', collectionId: c.id })} />
            ))}
          </div>
        </section>
      )}
      <PasteCodeDialog open={pasting} onClose={() => setPasting(false)} />
      <Dialog
        open={creating}
        title={t('Nouvelle collection')}
        confirmLabel={t('Créer')}
        confirmDisabled={!name.trim()}
        onConfirm={() => {
          createCollection(name);
          setName('');
          setCreating(false);
        }}
        onCancel={() => setCreating(false)}
      >
        <TextField label={t('Nom')} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
      </Dialog>
    </>
  );
}

/** Collection de l'utilisateur ou collection automatique : même carte. */
function CollectionCard({ name, ids, onOpen }: { name: string; ids: string[]; onOpen: () => void }) {
  const items = useLibrary((s) => s.items);
  const covers = ids
    .slice(0, 3)
    .map((id) => items[id])
    .filter((w): w is Wallpaper => !!w);
  return (
    <button type="button" className="collection-card state" onClick={onOpen}>
      <span className="collection-card__covers">
        {covers.length === 0 ? <Icon name="collections" size={32} /> : covers.map((w) => <CoverImage key={w.id} wallpaper={w} />)}
      </span>
      <span className="collection-card__name">{name}</span>
      <span className="collection-card__count">
        {tn(ids.length, '{count} fond', '{count} fonds')}
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
    showSnackbar(t('Échec : {message}', { message: nativeErrorMessage(error) }));
  }
}

function History() {
  const history = useLibrary((s) => s.history);
  const items = useLibrary((s) => s.items);
  const groups = useMemo(() => groupByDay(history), [history]);
  const [restoring, setRestoring] = useState(false);
  if (history.length === 0) {
    return <EmptyState icon="history" title={t('Historique vide')} text={t('Les fonds que tu appliques apparaîtront ici.')} />;
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
            {t('Revenir au fond précédent')}
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
                    headline={t(TARGET_LABELS[entry.target])}
                    supporting={`${new Date(entry.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}${
                      w.author ? ` · ${w.author.name}` : ''
                    }${entry.auto ? ` · ${t('automatique')}` : ''}`}
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
        ? t("Aujourd'hui")
        : day === today - 86_400_000
          ? t('Hier')
          : d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return [...groups.entries()];
}
