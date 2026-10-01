import { SystemBars } from '@capacitor/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { CollectionsSheet } from '@/features/library/CollectionsSheet';
import { useLibrary } from '@/features/library/store';
import { usePreviewSrc, useThumbSrc } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import { isLocalWallpaper } from '@/features/sources/device';
import type { Wallpaper } from '@/features/sources/types';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { type NormalizedRect, PrismeWallpaper, type WallpaperTarget, isNative, nativeErrorMessage } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Icon, IconButton, LinearProgress } from '@/shared/ui/components';
import { showSnackbar } from '@/shared/ui/overlays';
import { setLiveWallpaper } from '@/features/live/live';
import { LinkedSheet } from '@/features/linked/LinkedSheet';
import { PaletteSheet, simulationVars } from '@/features/palette/PaletteSheet';
import type { ColorScheme } from '@/shared/theme/scheme';
import { type ApplyChoice, ApplySheet } from './ApplySheet';
import { TARGET_LABELS, applyWallpaper } from './applyWallpaper';
import { type Size, fitStage } from './cropMath';
import { InfoSheet, sourceName } from './InfoSheet';
import { Simulation, type SimulationMode } from './Simulation';
import { usePanZoom } from './usePanZoom';
import './preview.css';

type Sheet = 'apply' | 'info' | 'collections' | 'palette' | 'linked' | null;

function isLightColor(hex: string): boolean {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
}

function useViewport(): Size {
  const [size, setSize] = useState<Size>(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function PreviewScreen({ wallpaper }: { wallpaper: Wallpaper }) {
  const screen = useScreenInfo();
  const viewport = useViewport();
  const stage = useMemo(() => (screen ? fitStage(viewport, screenRatio(screen)) : null), [screen, viewport]);
  const image = useMemo(() => ({ width: wallpaper.width, height: wallpaper.height }), [wallpaper.width, wallpaper.height]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mode, setMode] = useState<SimulationMode>('none');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [applying, setApplying] = useState<{ progress?: number } | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [hint, setHint] = useState(false);
  const [simScheme, setSimScheme] = useState<ColorScheme | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const panZoom = usePanZoom(stage, image, () => setControlsVisible((v) => !v));
  const thumbSrc = useThumbSrc(wallpaper);
  const previewSrc = usePreviewSrc(wallpaper);
  const favorite = useLibrary((s) => !!s.favorites[wallpaper.id]);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const defaultTarget = useSettings((s) => s.defaultTarget);
  const features = useSettings((s) => s.features);
  const push = useNavigation((s) => s.push);
  const setBarsOverride = useTheme((s) => s.setBarsOverride);
  const wallpaperRef = useRef(wallpaper);
  wallpaperRef.current = wallpaper;

  // Barres système lisibles sur l'image, masquées quand l'interface l'est.
  useLayoutEffect(() => {
    setBarsOverride(isLightColor(wallpaper.color) ? 'dark-content' : 'light-content');
    return () => setBarsOverride(null);
  }, [wallpaper.color, setBarsOverride]);

  useEffect(() => {
    if (!isNative) return;
    void (controlsVisible ? SystemBars.show() : SystemBars.hide()).catch(() => undefined);
  }, [controlsVisible]);

  useEffect(
    () => () => {
      if (isNative) void SystemBars.show().catch(() => undefined);
      // Image importée puis abandonnée : on libère le fichier.
      const w = wallpaperRef.current;
      if (w.source === 'device' && !useLibrary.getState().items[w.id]) {
        void PrismeWallpaper.deleteLocalImage({ path: w.full }).catch(() => undefined);
      }
    },
    [],
  );

  const isApplying = applying !== null;
  useEffect(() => {
    if (!isApplying) return;
    const handle = PrismeWallpaper.addListener('applyProgress', (e) => {
      if (e.id === wallpaper.id) setApplying({ progress: e.progress });
    });
    return () => void handle.then((h) => h.remove());
  }, [isApplying, wallpaper.id]);

  const [linkedCrop, setLinkedCrop] = useState<NormalizedRect | undefined>();

  const apply = async (choice: ApplyChoice) => {
    if (choice === 'linked') {
      setLinkedCrop(panZoom.getCrop());
      setSheet('linked');
      return;
    }
    if (choice === 'live') {
      setSheet(null);
      try {
        showSnackbar(await setLiveWallpaper(wallpaper, panZoom.getCrop()));
      } catch (error) {
        showSnackbar(`Échec : ${nativeErrorMessage(error)}`);
      }
      return;
    }
    const target: WallpaperTarget = choice;
    setSheet(null);
    setApplying({});
    try {
      await applyWallpaper({ wallpaper, target, crop: panZoom.getCrop() });
      showSnackbar(`Fond appliqué : ${TARGET_LABELS[target].toLowerCase()}`);
    } catch (error) {
      showSnackbar(`Échec : ${nativeErrorMessage(error)}`, { label: 'Réessayer', onAction: () => void apply(target) });
    } finally {
      setApplying(null);
    }
  };

  // En simulation, les commandes s'effacent pour laisser voir l'écran complet ; un appui les rappelle.
  const selectMode = (value: SimulationMode) => {
    setMode(value);
    window.clearTimeout(hideTimer.current);
    if (value === 'none') return;
    hideTimer.current = window.setTimeout(() => {
      setControlsVisible(false);
      setHint(true);
      hideTimer.current = window.setTimeout(() => setHint(false), 2200);
    }, 900);
  };

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (controlsVisible) setHint(false);
  }, [controlsVisible]);

  const onApplyPressed = () => (defaultTarget === 'ask' ? setSheet('apply') : void apply(defaultTarget));

  const onFavorite = () => {
    const added = toggleFavorite(wallpaper);
    showSnackbar(added ? 'Ajouté aux favoris' : 'Retiré des favoris');
  };

  return (
    <div className="preview" role="dialog" aria-label="Aperçu du fond d’écran" style={simScheme ? simulationVars(simScheme) : undefined}>
      <div
        className="preview__stage"
        style={stage ? { width: stage.width, height: stage.height } : undefined}
        {...panZoom.handlers}
        data-testid="preview-stage"
      >
        {!previewLoaded && <img className="preview__placeholder" src={thumbSrc} alt="" draggable={false} />}
        <img
          ref={panZoom.targetRef}
          className="preview__image"
          src={previewSrc}
          alt={wallpaper.alt}
          draggable={false}
          decoding="async"
          onLoad={() => setPreviewLoaded(true)}
          style={{ backgroundColor: wallpaper.color }}
        />
        <Simulation mode={mode} />
      </div>

      {controlsVisible && (
        <>
          <div className="preview__top">
            <IconButton icon="arrowBack" label="Retour" variant="on-image" onClick={goBack} />
            <span className="preview__spacer" />
            {panZoom.modified && <IconButton icon="restart" label="Recentrer" variant="on-image" onClick={panZoom.reset} />}
            <IconButton
              icon={favorite ? 'favoriteFill' : 'favorite'}
              label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              variant="on-image"
              selected={favorite}
              onClick={onFavorite}
            />
            {features.editor && (
              <IconButton
                icon="formatPaint"
                label="Retoucher"
                variant="on-image"
                onClick={() => push({ type: 'editor', wallpaper, crop: panZoom.getCrop() })}
              />
            )}
            {features.palette && (
              <IconButton icon="palette" label="Couleurs Material You" variant="on-image" onClick={() => setSheet('palette')} />
            )}
            <IconButton icon="libraryAdd" label="Ajouter à une collection" variant="on-image" onClick={() => setSheet('collections')} />
            <IconButton icon="info" label="Informations" variant="on-image" onClick={() => setSheet('info')} />
          </div>

          <div className="preview__bottom">
            {wallpaper.author ? (
              <a className="preview__credit" href={wallpaper.author.url} target="_blank" rel="noopener noreferrer">
                Photo : {wallpaper.author.name} · {sourceName(wallpaper)}
              </a>
            ) : (
              !isLocalWallpaper(wallpaper) && <span className="preview__credit">{sourceName(wallpaper)}</span>
            )}
            <div className="preview__modes" role="radiogroup" aria-label="Simulation">
              {(
                [
                  ['none', 'visibility', 'Image seule'],
                  ['home', 'home', 'Simuler l’écran d’accueil'],
                  ['lock', 'lock', 'Simuler l’écran de verrouillage'],
                ] as const
              ).map(([value, icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  aria-label={label}
                  title={label}
                  className="preview__mode state"
                  onClick={() => selectMode(value)}
                >
                  <Icon name={icon} />
                </button>
              ))}
            </div>
            <Button large icon="wallpaper" onClick={onApplyPressed} disabled={!!applying} className="preview__apply">
              Appliquer
            </Button>
          </div>
        </>
      )}

      {hint && !controlsVisible && (
        <div className="preview__hint" role="status">
          Touche l'écran pour afficher les commandes
        </div>
      )}

      {applying && (
        <div className="preview__progress" role="status">
          <span>{applying.progress !== undefined && applying.progress < 1 ? `Téléchargement ${Math.round(applying.progress * 100)} %` : 'Application…'}</span>
          <LinearProgress value={applying.progress} />
        </div>
      )}

      <ApplySheet open={sheet === 'apply'} onClose={() => setSheet(null)} onApply={(t) => void apply(t)} allowLinked />
      {features.linked && (
        <LinkedSheet wallpaper={wallpaper} crop={linkedCrop} open={sheet === 'linked'} onClose={() => setSheet(null)} />
      )}
      <InfoSheet wallpaper={wallpaper} open={sheet === 'info'} onClose={() => setSheet(null)} />
      <CollectionsSheet wallpaper={wallpaper} open={sheet === 'collections'} onClose={() => setSheet(null)} />
      {features.palette && (
        <PaletteSheet
          wallpaper={wallpaper}
          open={sheet === 'palette'}
          onClose={() => setSheet(null)}
          onSimulate={(scheme) => {
            setSimScheme(scheme);
            selectMode('home');
          }}
        />
      )}
    </div>
  );
}
