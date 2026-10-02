import { useState } from 'react';
import { WallpaperPicker } from '@/features/automation/components';
import { useThumbSrc } from '@/features/library/useImageSrc';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { Button, Icon } from '@/shared/ui/components';
import { LiveActivateButton } from './LiveActivate';
import { UnlockSection } from './UnlockSection';
import { WeatherOverlaySection } from './WeatherOverlaySection';
import { setLiveWallpaper, useLive } from './live';
import type { ModeSectionProps } from './modes';

/** Genre « Photo » : une image qui glisse avec l'inclinaison, et sa liste d'images (déverrouillage, double-tap). */
export function ImageSection({ optionOn, status, refresh }: ModeSectionProps) {
  const wallpaper = useLive((s) => s.wallpaper);
  const intensity = useLive((s) => s.intensity);
  const setIntensity = useLive((s) => s.setIntensity);
  const [picking, setPicking] = useState(false);

  return (
    <>
      <p className="option-hint option-hint--padded">
        {t('L’image glisse légèrement quand tu inclines le téléphone, comme si elle était derrière l’écran.')}
      </p>
      <div className="option-block live-choice">
        {wallpaper ? <LiveThumb wallpaper={wallpaper} /> : <div className="live-thumb live-thumb--empty"><Icon name="image" size={32} /></div>}
        <Button variant="outlined" onClick={() => setPicking(true)}>
          {wallpaper ? t('Changer d’image') : t('Choisir une image')}
        </Button>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">{t('Intensité de la parallaxe')}</h2>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          aria-label={t('Intensité de la parallaxe')}
          onChange={(e) => setIntensity(Number(e.target.value))}
        />
        <div className="live-scale">
          <span>{t('Subtile')}</span>
          <span>{t('Prononcée')}</span>
        </div>
      </div>

      <LiveActivateButton
        status={status}
        disabled={!optionOn || !wallpaper}
        refresh={refresh}
        onActivate={() => (wallpaper ? setLiveWallpaper(wallpaper) : Promise.resolve(''))}
      />

      <UnlockSection optionOn={optionOn} status={status} onChanged={() => setTimeout(refresh, 1500)} />

      <WeatherOverlaySection status={status} />

      <WallpaperPicker open={picking} title={t('Image du fond animé')} onClose={() => setPicking(false)} onPick={(w) => useLive.setState({ wallpaper: w })} />
    </>
  );
}

function LiveThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img className="live-thumb" src={src} alt="" style={{ backgroundColor: wallpaper.color }} />;
}
