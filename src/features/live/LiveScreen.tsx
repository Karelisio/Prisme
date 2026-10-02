import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { goBack } from '@/app/navigation';
import { WallpaperPicker } from '@/features/automation/components';
import { useThumbSrc } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { nativeErrorMessage } from '@/shared/native';
import { PrismeLive } from '@/shared/native/automation';
import { Button, Icon, IconButton, Switch } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { UnlockSection } from './UnlockSection';
import { setLiveWallpaper, useLive } from './live';
import '@/features/automation/automation.css';
import './live.css';

export function LiveScreen() {
  const enabled = useSettings((s) => s.features.live);
  const setFeature = useSettings((s) => s.setFeature);
  const wallpaper = useLive((s) => s.wallpaper);
  const intensity = useLive((s) => s.intensity);
  const setIntensity = useLive((s) => s.setIntensity);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['live-status'], queryFn: () => PrismeLive.getStatus(), refetchInterval: 5_000 });

  const activate = async (w: Wallpaper | null = wallpaper) => {
    if (!w) return;
    setBusy(true);
    try {
      showSnackbar(await setLiveWallpaper(w));
      void status.refetch();
    } catch (error) {
      showSnackbar(nativeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen overlay-screen option-screen">
      <header className="top-bar">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Fond animé</h1>
        <Switch label="Activer l'option fond animé" checked={enabled} onChange={(v) => setFeature('live', v)} />
      </header>
      <p className="option-intro">
        Le fond glisse légèrement quand tu inclines le téléphone, comme s'il était derrière l'écran. Le capteur est coupé
        quand le fond n'est pas visible et en mode économie d'énergie.
      </p>

      {status.data?.active && (
        <div className="option-status" role="status">
          <Icon name="checkCircle" />
          Le fond animé Prisme est actif.
        </div>
      )}

      <div className="option-block live-choice">
        {wallpaper ? <LiveThumb wallpaper={wallpaper} /> : <div className="live-thumb live-thumb--empty"><Icon name="image" size={32} /></div>}
        <Button variant="outlined" onClick={() => setPicking(true)}>
          {wallpaper ? 'Changer d’image' : 'Choisir une image'}
        </Button>
      </div>

      <div className="option-block">
        <h2 className="option-block__title">Intensité de la parallaxe</h2>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={intensity}
          aria-label="Intensité de la parallaxe"
          onChange={(e) => setIntensity(Number(e.target.value))}
        />
        <div className="live-scale">
          <span>Subtile</span>
          <span>Prononcée</span>
        </div>
      </div>

      <div className="option-actions">
        <Button icon="rotation3d" disabled={!enabled || !wallpaper || busy} onClick={() => void activate()}>
          {status.data?.active ? 'Mettre à jour' : 'Activer le fond animé'}
        </Button>
      </div>

      <UnlockSection optionOn={enabled} status={status.data} onChanged={() => setTimeout(() => void status.refetch(), 1500)} />

      <WallpaperPicker open={picking} title="Image du fond animé" onClose={() => setPicking(false)} onPick={(w) => useLive.setState({ wallpaper: w })} />
    </div>
  );
}

function LiveThumb({ wallpaper }: { wallpaper: Wallpaper }) {
  const src = useThumbSrc(wallpaper);
  return <img className="live-thumb" src={src} alt="" style={{ backgroundColor: wallpaper.color }} />;
}
