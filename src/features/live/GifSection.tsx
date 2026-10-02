import { t } from '@/shared/i18n';
import { LiveActivateButton } from './LiveActivate';
import { MediaChoice } from './MediaChoice';
import { activateLiveMode } from './live';
import { MEDIA_LIMIT_MB } from './media';
import type { ModeSectionProps } from './modes';

/** Genre « GIF » : un GIF animé de la galerie, ajusté à l’écran (centré, les bords sont recadrés). */
export function GifSection({ optionOn, status, refresh }: ModeSectionProps) {
  const gif = status?.media?.gif;
  return (
    <>
      <p className="option-hint option-hint--padded">
        {t(
          'Le GIF remplit l’écran : centré, ce qui dépasse est recadré. Il tourne en boucle et se fige quand l’écran est éteint ou en économie de batterie. Il est copié dans l’app ({limit} Mo au plus) ; le WebP animé est aussi accepté sur Android 9 et plus.',
          { limit: MEDIA_LIMIT_MB.gif },
        )}
      </p>
      <MediaChoice kind="gif" media={gif} refresh={refresh} />
      <LiveActivateButton
        status={status}
        disabled={!optionOn || !gif}
        refresh={refresh}
        onActivate={() => activateLiveMode('gif')}
      />
    </>
  );
}
