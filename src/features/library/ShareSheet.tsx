import { useEffect, useState } from 'react';
import type { Wallpaper } from '@/features/sources/types';
import { haptic } from '@/shared/lib/haptics';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeSystem } from '@/shared/native/system';
import { Button, Spinner } from '@/shared/ui/components';
import { BottomSheet, showSnackbar } from '@/shared/ui/overlays';
import { copyText } from './clipboard';
import { QrView } from './QrView';
import { MAX_SHARED_ITEMS, ShareError, type ShareBuild, buildShare, exclusionMessage, shareMessage, splitShareable } from './share';
import './library.css';

type State = { status: 'loading' } | { status: 'ready'; build: ShareBuild } | { status: 'empty' } | { status: 'error'; message: string };

/**
 * Partage d'une collection sans compte : lien (menu de partage Android), code à copier et QR code.
 * Le code ne contient que le nom et la liste des fonds, retrouvés par le destinataire chez leurs sources.
 */
export function ShareSheet({ name, wallpapers, open, onClose }: { name: string; wallpapers: Wallpaper[]; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!open) return;
    let current = true;
    setState({ status: 'loading' });
    buildShare(name, wallpapers).then(
      (build) => current && setState(build ? { status: 'ready', build } : { status: 'empty' }),
      (error: unknown) => current && setState({ status: 'error', message: error instanceof ShareError ? error.message : 'Impossible de préparer le partage' }),
    );
    return () => {
      current = false;
    };
  }, [open, name, wallpapers]);

  const share = async (build: ShareBuild) => {
    try {
      await PrismeSystem.shareText({ text: shareMessage(name, build.count, build.code), title: `Collection Prisme : ${name}` });
    } catch (error) {
      showSnackbar(`Partage impossible : ${nativeErrorMessage(error)}`);
    }
  };

  const copy = async (build: ShareBuild) => {
    const copied = await copyText(build.code);
    haptic(copied ? 'confirm' : 'reject');
    showSnackbar(copied ? 'Code copié : colle-le dans « Coller un code »' : 'Copie impossible sur ce téléphone');
  };

  const excluded = state.status === 'ready' ? state.build.excluded : splitShareable(wallpapers).excluded;
  const why = exclusionMessage(excluded);

  return (
    <BottomSheet open={open} onClose={onClose} title={`Partager « ${name} »`}>
      <div className="share">
        {state.status === 'loading' && (
          <div className="share__loading">
            <Spinner size={32} label="Préparation du partage" />
          </div>
        )}
        {state.status === 'error' && (
          <p className="share__note share__note--error" role="alert">
            {state.message}
          </p>
        )}
        {state.status === 'empty' && <p className="share__note">Aucun fond de cette collection ne peut être partagé.</p>}
        {state.status === 'ready' && (
          <>
            <p className="share__summary">
              {state.build.count} fond{state.build.count > 1 ? 's' : ''} partagé{state.build.count > 1 ? 's' : ''}
              {state.build.truncated ? ` (les ${MAX_SHARED_ITEMS} premiers)` : ''}. Pas de compte : le code ne contient que le nom et la liste des fonds, que ton ami retrouvera chez leurs sources.
            </p>
            {why && <p className="share__note">{why}</p>}
            <div className="share__actions">
              <Button icon="share" onClick={() => void share(state.build)}>
                Partager le lien
              </Button>
              <Button variant="tonal" icon="contentCopy" onClick={() => void copy(state.build)}>
                Copier le code
              </Button>
            </div>
            <QrView text={state.build.link} />
            <p className="share__caption">Ou fais-le scanner : Bibliothèque › Collections › Scanner un QR.</p>
          </>
        )}
        {state.status !== 'ready' && why && <p className="share__note">{why}</p>}
      </div>
    </BottomSheet>
  );
}
