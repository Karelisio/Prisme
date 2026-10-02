import { SystemBars } from '@capacitor/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { CollectionsSheet } from '@/features/library/CollectionsSheet';
import { TagsSheet } from '@/features/library/TagsSheet';
import { useLibrary } from '@/features/library/store';
import { usePreviewSrc, useThumbSrc } from '@/features/library/useImageSrc';
import { useSettings } from '@/features/settings/store';
import { isLocalWallpaper } from '@/features/sources/device';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { haptic } from '@/shared/lib/haptics';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { type NormalizedRect, PrismeWallpaper, type WallpaperTarget, isNative, nativeErrorMessage, toWebUrl } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Icon, IconButton, LinearProgress, ListItem } from '@/shared/ui/components';
import { BottomSheet, showSnackbar, undoLabel } from '@/shared/ui/overlays';
import { setLiveWallpaper } from '@/features/live/live';
import { HideSheet } from '@/features/discover/HideSheet';
import { photographerOf } from '@/features/discover/store';
import { LinkedSheet } from '@/features/linked/LinkedSheet';
import { PaletteSheet, simulationVars } from '@/features/palette/PaletteSheet';
import type { ColorScheme } from '@/shared/theme/scheme';
import { type ApplyChoice, ApplySheet } from './ApplySheet';
import { TARGET_LABELS, applyWallpaper, undoLastApply } from './applyWallpaper';
import { type Size, fitStage } from './cropMath';
import { saveToGallery, shareWallpaper } from './exportWallpaper';
import { InfoSheet, creditPrefix, sourceName } from './InfoSheet';
import { Simulation, type SimulationMode } from './Simulation';
import { usePanZoom } from './usePanZoom';
import './preview.css';

type Sheet = 'apply' | 'info' | 'collections' | 'tags' | 'palette' | 'linked' | 'more' | 'hide' | null;

/** Tâche en cours affichée en bas de l'aperçu (application, enregistrement, partage). */
interface Task {
  label: string;
  progress?: number;
}

/** Annulation proposée juste après l'application d'un fond. */
async function undo() {
  try {
    showSnackbar(await undoLastApply());
  } catch (error) {
    showSnackbar(t('Échec : {error}', { error: nativeErrorMessage(error) }));
  }
}

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

export function PreviewScreen({ wallpaper, list }: { wallpaper: Wallpaper; list?: Wallpaper[] }) {
  const screen = useScreenInfo();
  const viewport = useViewport();
  const stage = useMemo(() => (screen ? fitStage(viewport, screenRatio(screen)) : null), [screen, viewport]);
  // Taille inconnue (certaines images NASA) : mesurée sur la miniature puis sur l'aperçu chargé.
  const [measured, setMeasured] = useState<Size | null>(null);
  const known = wallpaper.width > 0 && wallpaper.height > 0;
  const image = useMemo(
    () => (known ? { width: wallpaper.width, height: wallpaper.height } : measured),
    [known, wallpaper.width, wallpaper.height, measured],
  );
  const measure = (img: HTMLImageElement, final: boolean) => {
    if (known || !img.naturalWidth || !img.naturalHeight) return;
    if (final || !measured) setMeasured({ width: img.naturalWidth, height: img.naturalHeight });
  };
  const [controlsVisible, setControlsVisible] = useState(true);
  const [mode, setMode] = useState<SimulationMode>('none');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [hint, setHint] = useState(false);
  const [simScheme, setSimScheme] = useState<ColorScheme | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const replace = useNavigation((s) => s.replace);
  const index = list ? list.findIndex((w) => w.id === wallpaper.id) : -1;
  // Glisser au-delà du bord de l'image : fond voisin de la grille d'origine.
  const onSwipe = (direction: 1 | -1) => {
    const next = list && index >= 0 ? list[index + direction] : undefined;
    if (!next || task) return false;
    haptic('tick');
    replace({ type: 'preview', wallpaper: next, list });
    return true;
  };
  const panZoom = usePanZoom(stage, image, () => setControlsVisible((v) => !v), { onSwipe: list ? onSwipe : undefined });
  const thumbSrc = useThumbSrc(wallpaper);
  // Aperçu introuvable (variante absente chez la source) : on affiche l'image HD.
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewSrc = usePreviewSrc(wallpaper);
  const imageSrc = previewFailed ? toWebUrl(wallpaper.full) : previewSrc;
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

  const busy = task !== null;
  useEffect(() => {
    if (!busy) return;
    const handle = PrismeWallpaper.addListener('applyProgress', (e) => {
      if (e.id === wallpaper.id) setTask((current) => (current ? { ...current, progress: e.progress } : current));
    });
    return () => void handle.then((h) => h.remove());
  }, [busy, wallpaper.id]);

  /** Exécute une action longue (téléchargement HD) avec sa progression en bas de l'écran. */
  const run = async (label: string, action: () => Promise<void>) => {
    setSheet(null);
    setTask({ label });
    try {
      await action();
    } catch (error) {
      haptic('reject');
      showSnackbar(t('Échec : {error}', { error: nativeErrorMessage(error) }));
    } finally {
      setTask(null);
    }
  };

  const onSave = () =>
    run(t('Enregistrement…'), async () => {
      const message = await saveToGallery(wallpaper);
      haptic('confirm');
      showSnackbar(message);
    });

  const onShare = () => run(t('Préparation du partage…'), () => shareWallpaper(wallpaper));

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
        showSnackbar(t('Échec : {error}', { error: nativeErrorMessage(error) }));
      }
      return;
    }
    const target: WallpaperTarget = choice;
    setSheet(null);
    setTask({ label: t('Application…') });
    try {
      await applyWallpaper({ wallpaper, target, crop: panZoom.getCrop() });
      haptic('confirm');
      showSnackbar(t('Fond appliqué : {screen}', { screen: TARGET_LABELS[target].toLowerCase() }), { label: undoLabel(), onAction: () => void undo() });
    } catch (error) {
      haptic('reject');
      showSnackbar(t('Échec : {error}', { error: nativeErrorMessage(error) }), { label: t('Réessayer'), onAction: () => void apply(target) });
    } finally {
      setTask(null);
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

  const photographer = photographerOf(wallpaper);

  const onHidden = (message: string, undoHide: () => void) => {
    setSheet(null);
    haptic('tick');
    goBack();
    showSnackbar(message, { label: undoLabel(), onAction: undoHide });
  };

  const onFavorite = () => {
    const added = toggleFavorite(wallpaper);
    haptic('tick');
    showSnackbar(added ? t('Ajouté aux favoris') : t('Retiré des favoris'));
  };

  return (
    <div className="preview" role="dialog" aria-label={t('Aperçu du fond d’écran')} style={simScheme ? simulationVars(simScheme) : undefined}>
      <div
        className="preview__stage"
        style={stage ? { width: stage.width, height: stage.height } : undefined}
        {...panZoom.handlers}
        data-testid="preview-stage"
      >
        {!previewLoaded && (
          <img className="preview__placeholder" src={thumbSrc} alt="" draggable={false} onLoad={(e) => measure(e.currentTarget, false)} />
        )}
        <img
          ref={panZoom.targetRef}
          className="preview__image"
          src={imageSrc}
          alt={wallpaper.alt}
          draggable={false}
          decoding="async"
          onLoad={(e) => {
            measure(e.currentTarget, true);
            setPreviewLoaded(true);
          }}
          onError={() => {
            if (!previewFailed && wallpaper.preview !== wallpaper.full) setPreviewFailed(true);
          }}
          style={{ backgroundColor: wallpaper.color }}
        />
        <Simulation mode={mode} />
      </div>

      {controlsVisible && (
        <>
          <div className="preview__top">
            <IconButton icon="arrowBack" label={t('Retour')} variant="on-image" onClick={goBack} />
            <span className="preview__spacer" />
            {panZoom.modified && <IconButton icon="restart" label={t('Recentrer')} variant="on-image" onClick={panZoom.reset} />}
            <IconButton
              icon={favorite ? 'favoriteFill' : 'favorite'}
              label={favorite ? t('Retirer des favoris') : t('Ajouter aux favoris')}
              variant="on-image"
              selected={favorite}
              onClick={onFavorite}
            />
            <IconButton icon="libraryAdd" label={t('Ajouter à une collection')} variant="on-image" onClick={() => setSheet('collections')} />
            <IconButton icon="share" label={t('Partager')} variant="on-image" onClick={() => void onShare()} disabled={busy} />
            <IconButton icon="moreVert" label={t('Plus d’actions')} variant="on-image" onClick={() => setSheet('more')} />
          </div>

          <div className="preview__bottom">
            {photographer ? (
              <button type="button" className="preview__credit" onClick={() => push({ type: 'photographer', photographer })}>
                {t('Photo :')} {photographer.name} · {sourceName(wallpaper)}
              </button>
            ) : wallpaper.author ? (
              <a className="preview__credit" href={wallpaper.author.url} target="_blank" rel="noopener noreferrer">
                {creditPrefix(wallpaper)} {wallpaper.author.name} · {sourceName(wallpaper)}
              </a>
            ) : (
              !isLocalWallpaper(wallpaper) && <span className="preview__credit">{sourceName(wallpaper)}</span>
            )}
            <div className="preview__modes" role="radiogroup" aria-label={t('Simulation')}>
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
                  aria-label={t(label)}
                  title={t(label)}
                  className="preview__mode state"
                  onClick={() => selectMode(value)}
                >
                  <Icon name={icon} />
                </button>
              ))}
            </div>
            <Button large icon="wallpaper" onClick={onApplyPressed} disabled={busy} className="preview__apply">
              {t('Appliquer')}
            </Button>
          </div>
        </>
      )}

      {hint && !controlsVisible && (
        <div className="preview__hint" role="status">
          {t("Touche l'écran pour afficher les commandes")}
        </div>
      )}

      {task && (
        <div className="preview__progress" role="status">
          <span>{task.progress !== undefined && task.progress < 1 ? t('Téléchargement {percent} %', { percent: Math.round(task.progress * 100) }) : task.label}</span>
          <LinearProgress value={task.progress} />
        </div>
      )}

      <BottomSheet open={sheet === 'more'} onClose={() => setSheet(null)} label={t('Plus d’actions')}>
        <ul className="list">
          {!isLocalWallpaper(wallpaper) && (
            <li>
              <ListItem
                headline={t('Plus comme ça')}
                supporting={t('Fonds du même sujet ou de la même couleur')}
                leading={<Icon name="imageSearch" />}
                onClick={() => {
                  setSheet(null);
                  push({ type: 'similar', wallpaper });
                }}
              />
            </li>
          )}
          {photographer && (
            <li>
              <ListItem
                headline={t('Photos de {name}', { name: photographer.name })}
                supporting={t('Tous ses fonds, et le suivre')}
                leading={<Icon name="person" />}
                onClick={() => {
                  setSheet(null);
                  push({ type: 'photographer', photographer });
                }}
              />
            </li>
          )}
          <li>
            <ListItem headline={t('Enregistrer dans la galerie')} supporting={t('Image HD, album Prisme')} leading={<Icon name="download" />} onClick={() => void onSave()} disabled={busy} />
          </li>
          {features.editor && (
            <li>
              <ListItem
                headline={t('Retoucher')}
                supporting={t('Filtres, effets, recadrage, texte…')}
                leading={<Icon name="formatPaint" />}
                onClick={() => {
                  setSheet(null);
                  push({ type: 'editor', wallpaper, crop: panZoom.getCrop() });
                }}
              />
            </li>
          )}
          {features.palette && (
            <li>
              <ListItem headline={t('Couleurs Material You')} supporting={t('Palette générée par ce fond')} leading={<Icon name="palette" />} onClick={() => setSheet('palette')} />
            </li>
          )}
          <li>
            <ListItem headline={t('Étiquettes')} supporting={t('Pour retrouver ce fond dans tes favoris')} leading={<Icon name="label" />} onClick={() => setSheet('tags')} />
          </li>
          <li>
            <ListItem headline={t('Informations')} supporting={t('Auteur, source, dimensions')} leading={<Icon name="info" />} onClick={() => setSheet('info')} />
          </li>
          {!isLocalWallpaper(wallpaper) && (
            <li>
              <ListItem headline={t('Ne plus voir…')} supporting={t('Ce fond, son auteur ou un sujet')} leading={<Icon name="visibilityOff" />} onClick={() => setSheet('hide')} />
            </li>
          )}
        </ul>
      </BottomSheet>

      <HideSheet wallpaper={wallpaper} open={sheet === 'hide'} onClose={() => setSheet(null)} onHidden={onHidden} />

      <ApplySheet open={sheet === 'apply'} onClose={() => setSheet(null)} onApply={(choice) => void apply(choice)} allowLinked />
      {features.linked && (
        <LinkedSheet wallpaper={wallpaper} crop={linkedCrop} open={sheet === 'linked'} onClose={() => setSheet(null)} />
      )}
      <InfoSheet wallpaper={wallpaper} open={sheet === 'info'} onClose={() => setSheet(null)} />
      <CollectionsSheet wallpaper={wallpaper} open={sheet === 'collections'} onClose={() => setSheet(null)} />
      <TagsSheet wallpaper={wallpaper} open={sheet === 'tags'} onClose={() => setSheet(null)} />
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
