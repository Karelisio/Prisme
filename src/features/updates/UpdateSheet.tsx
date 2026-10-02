import { useEffect, useState } from 'react';
import { formatBytes } from '@/shared/lib/format';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeSystem, nativeErrorCode } from '@/shared/native/system';
import { Button, LinearProgress } from '@/shared/ui/components';
import { BottomSheet } from '@/shared/ui/overlays';
import { parseNotes } from './updates';
import { closeUpdateSheet, dismissUpdate, useUpdates } from './useUpdates';
import './updates.css';

type Phase = 'idle' | 'downloading' | 'ready' | 'permission';

/** Feuille « Mise à jour disponible » : notes de version, téléchargement vérifié, installation. */
export function UpdateSheet() {
  const open = useUpdates((s) => s.sheetOpen);
  const release = useUpdates((s) => s.available);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const build = release?.build;

  // Une autre release : on repart de zéro.
  useEffect(() => {
    setPhase('idle');
    setError(null);
  }, [build]);

  useEffect(() => {
    if (phase !== 'downloading') return;
    const handle = PrismeSystem.addListener('updateProgress', (e) => setProgress(e.progress));
    return () => void handle.then((h) => h.remove());
  }, [phase]);

  if (!release) return null;

  const install = async () => {
    setError(null);
    try {
      if (phase !== 'ready' && phase !== 'permission') {
        setProgress(undefined);
        setPhase('downloading');
        await PrismeSystem.downloadUpdate({ url: release.apkUrl });
        setPhase('ready');
      }
      await PrismeSystem.installUpdate();
      setPhase('ready');
    } catch (e) {
      const code = nativeErrorCode(e);
      if (code === 'INSTALL_PERMISSION') {
        setPhase('permission');
        return;
      }
      setError(nativeErrorMessage(e));
      // APK introuvable ou refusé : le prochain appui le retélécharge.
      setPhase((p) => (p === 'downloading' || code === 'NOT_FOUND' || code?.startsWith('UPDATE_') ? 'idle' : p));
    }
  };

  const notes = parseNotes(release.notes);

  return (
    <BottomSheet open={open} onClose={closeUpdateSheet} title="Mise à jour disponible">
      <div className="update">
        <p className="update__version">
          Prisme {release.version}
          {release.size > 0 && <span> · {formatBytes(release.size)}</span>}
        </p>
        {notes.length > 0 && (
          <div className="update__notes">
            {notes.map((block, i) =>
              block.kind === 'heading' ? (
                <h3 key={i}>{block.text}</h3>
              ) : block.kind === 'item' ? (
                <p key={i} className="update__item">
                  {block.text}
                </p>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </div>
        )}
        {phase === 'downloading' && (
          <div className="update__progress">
            <span>Téléchargement…</span>
            <LinearProgress value={progress} label="Téléchargement de la mise à jour" />
          </div>
        )}
        {phase === 'permission' && (
          <div className="update__permission" role="status">
            <p>Android demande d'autoriser Prisme à installer des applications. Active l'option, reviens ici puis appuie sur « Installer ».</p>
            <Button variant="tonal" onClick={() => void PrismeSystem.openInstallSettings()}>
              Ouvrir le réglage
            </Button>
          </div>
        )}
        {phase === 'ready' && <p className="update__hint">Si l'installation a été interrompue, appuie à nouveau sur « Installer ».</p>}
        {error && (
          <p className="update__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet__actions">
        <Button variant="text" onClick={dismissUpdate} disabled={phase === 'downloading'}>
          Plus tard
        </Button>
        <Button icon="update" onClick={() => void install()} disabled={phase === 'downloading'}>
          Installer
        </Button>
      </div>
    </BottomSheet>
  );
}
