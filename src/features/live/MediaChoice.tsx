import { useState } from 'react';
import { nativeErrorMessage } from '@/shared/native';
import { type LiveMedia, type LiveMediaKind, PrismeLive } from '@/shared/native/automation';
import { Button, Icon, LinearProgress } from '@/shared/ui/components';
import type { IconName } from '@/shared/ui/icons';
import { showSnackbar } from '@/shared/ui/overlays';
import { mediaDetails } from './media';

const TEXTS: Record<LiveMediaKind, { icon: IconName; none: string; choose: string; change: string }> = {
  video: { icon: 'movie', none: 'Aucune vidéo choisie', choose: 'Choisir une vidéo', change: 'Changer de vidéo' },
  gif: { icon: 'gif', none: 'Aucun GIF choisi', choose: 'Choisir un GIF', change: 'Changer de GIF' },
};

/**
 * Choix du fichier d'un genre « média » (vidéo, GIF) : bouton vers le sélecteur de fichiers du système, et ce qu'on
 * sait du fichier déjà copié dans l'app ([media], lu dans l'état du natif). [refresh] relit cet état.
 */
export function MediaChoice({ kind, media, refresh }: { kind: LiveMediaKind; media: LiveMedia | undefined; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const texts = TEXTS[kind];

  const pick = async () => {
    setBusy(true);
    try {
      const result = await PrismeLive.pickMedia({ kind });
      if (!result.cancelled) refresh();
    } catch (error) {
      // Fichier trop lourd, illisible, format non pris en charge : le natif donne la raison.
      showSnackbar(nativeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="option-block live-media-choice">
      <div className="live-media">
        <div className="live-media__icon">
          <Icon name={texts.icon} size={32} />
        </div>
        <div className="live-media__text">
          <span className="live-media__name">{media ? media.name : texts.none}</span>
          {media && <span className="live-media__details">{mediaDetails(media)}</span>}
        </div>
      </div>
      <Button variant="outlined" disabled={busy} onClick={() => void pick()}>
        {media ? texts.change : texts.choose}
      </Button>
      {/* Le fichier est copié dans l'app : une vidéo lourde prend quelques secondes. */}
      {busy && <LinearProgress label="Copie du fichier" />}
    </div>
  );
}
