import { LiveActivateButton } from './LiveActivate';
import { MediaChoice } from './MediaChoice';
import { activateVideo } from './live';
import { MEDIA_LIMIT_MB } from './media';
import type { ModeSectionProps } from './modes';

/** Genre « Vidéo » : une vidéo de la galerie, en boucle et sans le son, par un fond Android à part. */
export function VideoSection({ optionOn, status, refresh }: ModeSectionProps) {
  const video = status?.media?.video;
  return (
    <>
      <p className="option-hint option-hint--padded">
        La vidéo tourne en boucle, sans le son, et se fige quand l’écran est éteint ou en économie de batterie. Elle est
        copiée dans l’app ({MEDIA_LIMIT_MB.video} Mo au plus) ; une vidéo courte ménage la batterie.
      </p>
      <MediaChoice kind="video" media={video} refresh={refresh} />
      <LiveActivateButton
        status={status}
        component="video"
        disabled={!optionOn || !video}
        refresh={refresh}
        onActivate={activateVideo}
      />
    </>
  );
}
