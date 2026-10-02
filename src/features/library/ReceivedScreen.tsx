import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { WallpaperGrid } from '@/features/browse/WallpaperGrid';
import { GRID_MARGIN, columnCount } from '@/features/browse/mosaic';
import { thumbWidthFor } from '@/features/browse/useFeed';
import { useSettings } from '@/features/settings/store';
import { t, tn } from '@/shared/i18n';
import { haptic } from '@/shared/lib/haptics';
import { Button, EmptyState, IconButton, LinearProgress } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { type ReceivedResult, emptyResult, failureMessages, foundInOrder, loadReceived } from './received';
import { useLibrary } from './store';
import './library.css';

/**
 * Collection reçue (lien, QR code ou code collé) : les fonds sont retrouvés chez leurs sources à
 * partir de leurs identifiants, puis ajoutés à la bibliothèque en une nouvelle collection.
 */
export function ReceivedScreen({ name, ids }: { name: string; ids: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layout = useSettings((s) => s.gridLayout);
  const dataSaver = useSettings((s) => s.dataSaver);
  const [thumbWidth] = useState(() => thumbWidthFor(columnCount(layout, window.innerWidth - GRID_MARGIN), dataSaver));
  const [result, setResult] = useState<ReceivedResult>(emptyResult);
  const [loading, setLoading] = useState(true);
  const previous = useRef<ReceivedResult>(emptyResult());
  const controller = useRef<AbortController | null>(null);
  const hydrated = useLibrary((s) => s.hydrated);
  const importCollection = useLibrary((s) => s.importCollection);
  const replace = useNavigation((s) => s.replace);

  /** (Re)lance la récupération ; ce qui est déjà retrouvé n'est pas redemandé. */
  const load = useCallback(() => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    void loadReceived(ids, { thumbWidth, previous: previous.current, signal: abort.signal, onProgress: setResult }).then((done) => {
      if (abort.signal.aborted) return;
      previous.current = done;
      setResult(done);
      setLoading(false);
    });
  }, [ids, thumbWidth]);

  useEffect(() => {
    load();
    return () => controller.current?.abort();
  }, [load]);

  const wallpapers = useMemo(() => foundInOrder(ids, result), [ids, result]);
  const handled = result.found.size + result.missing.size + result.failed.size;
  const problems = failureMessages(result);
  // « 2 fonds retrouvés, 1 introuvable (retiré par leur source), 1 non récupéré. »
  const summary = `${[
    tn(wallpapers.length, '{count} fond retrouvé', '{count} fonds retrouvés'),
    ...(result.missing.size > 0 ? [tn(result.missing.size, '{count} introuvable (retiré par leur source)', '{count} introuvables (retirés par leur source)')] : []),
    ...(result.failed.size > 0 ? [tn(result.failed.size, '{count} non récupéré', '{count} non récupérés')] : []),
  ].join(', ')}.`;

  const add = () => {
    const id = importCollection(name, wallpapers);
    haptic('confirm');
    showSnackbar(t('Collection « {name} » ajoutée à ta bibliothèque', { name }));
    replace({ type: 'collection', collectionId: id });
  };

  return (
    <div ref={scrollRef} className="screen overlay-screen received">
      <header className="top-bar">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{name}</h1>
      </header>
      <div className="received__status" role="status">
        <p className="received__title">{t('Collection reçue · {wallpapers}', { wallpapers: tn(ids.length, '{count} fond', '{count} fonds') })}</p>
        {loading ? (
          <>
            <p className="received__detail">
              {t('Récupération des fonds chez leurs sources… {done} / {total}', { done: handled, total: ids.length })}
            </p>
            <LinearProgress value={handled / Math.max(1, ids.length)} label={t('Récupération des fonds')} />
          </>
        ) : (
          <p className="received__detail">{summary}</p>
        )}
        {!loading && problems.length > 0 && (
          <ul className="received__problems">
            {problems.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {!loading && result.failed.size > 0 && (
          <Button variant="text" icon="refresh" onClick={load}>
            {t('Réessayer')}
          </Button>
        )}
      </div>
      <div className="received__body">
        {wallpapers.length > 0 ? (
          <WallpaperGrid items={wallpapers} scrollRef={scrollRef} />
        ) : (
          !loading && (
            <EmptyState
              icon="collections"
              title={t('Aucun fond récupéré')}
              text={t('Les sources n’ont renvoyé aucun de ces fonds. Vérifie ta connexion puis réessaie.')}
            />
          )
        )}
      </div>
      <div className="received__bar">
        <Button large icon="libraryAdd" disabled={loading || wallpapers.length === 0 || !hydrated} onClick={add}>
          {t('Ajouter à ma bibliothèque')}
        </Button>
      </div>
    </div>
  );
}
