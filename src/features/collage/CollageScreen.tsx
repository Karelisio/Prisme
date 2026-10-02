import { type CSSProperties, type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBackHandler } from '@/app/backStack';
import { goBack, useNavigation } from '@/app/navigation';
import { WallpaperPicker } from '@/features/automation/components';
import { saveCreation } from '@/features/library/creations';
import type { Wallpaper } from '@/features/sources/types';
import { trackUnsplashDownload } from '@/features/sources/unsplash';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { nativeErrorMessage } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Chip, Icon, IconButton, LinearProgress, Spinner } from '@/shared/ui/components';
import { fitBox } from '@/shared/ui/FittedCanvas';
import type { IconName } from '@/shared/ui/icons';
import { showSnackbar } from '@/shared/ui/overlays';
import { CollageCell } from './CollageCell';
import { LayoutThumb } from './LayoutThumb';
import { backgroundGroups, isLightColor } from './colors';
import { DEFAULT_FRAMING, decodeWidth, isDefaultFraming } from './framing';
import { useCollagePhotos } from './images';
import { LAYOUTS, type LayoutId, type Size, defaultLayout, layoutCells, layoutInfo, photoWindow } from './layouts';
import { type DrawnPhoto, exportCollage, renderCollage, screenUnit } from './render';
import {
  CORNERS_MAX,
  type CollageStyle,
  DEFAULT_STYLE,
  SPACING_MAX,
  type Slots,
  clearPhoto,
  filledCount,
  recenterAll,
  seedSlots,
  setPhoto,
  setSlotFraming,
  swapPhotos,
  usedWallpapers,
} from './slots';
import './collage.css';

type Tool = 'layout' | 'adjust' | 'background';

const TOOLS: { key: Tool; label: string; icon: IconName }[] = [
  { key: 'layout', label: 'Disposition', icon: 'collage' },
  { key: 'adjust', label: 'Réglages', icon: 'tune' },
  { key: 'background', label: 'Fond', icon: 'fill' },
];

const SAVED_MESSAGE = 'Enregistré dans la collection « Créations »';

function useElementSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * Canevas d'aperçu au ratio de l'écran, avec par-dessus les zones tactiles des cases : elles
 * reçoivent la taille d'affichage pour se placer exactement sur le dessin.
 */
function Stage({
  busy,
  ratio,
  draw,
  ink,
  onBackground,
  children,
}: {
  /** Pendant l'enregistrement, les cases ne réagissent plus : la photo exportée ne peut pas changer. */
  busy: boolean;
  ratio: number;
  draw: Draw | null;
  /** Couleur des pictogrammes des cases vides, lisible sur le fond choisi. */
  ink: string;
  onBackground: () => void;
  children: (display: Size) => ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useElementSize(boxRef);
  const display = box ? fitBox(box, ratio) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !display || !draw) return;
    const frame = requestAnimationFrame(() => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.round(display.width * scale);
      const height = Math.round(display.height * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, width, height);
    });
    return () => cancelAnimationFrame(frame);
  }, [draw, display?.width, display?.height]);

  return (
    <div
      ref={boxRef}
      className="collage__stage"
      inert={busy}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('.collage-cell')) onBackground();
      }}
    >
      {display && (
        <div className="collage__canvas" style={{ width: display.width, height: display.height }}>
          <canvas ref={canvasRef} aria-label="Aperçu du collage" style={{ width: display.width, height: display.height }} />
          <div className="collage__cells" style={{ '--collage-ink': ink } as CSSProperties}>
            {children(display)}
          </div>
        </div>
      )}
    </div>
  );
}

function Range({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="collage__range">
      <span className="collage__range-head">
        {label}
        <span aria-hidden="true">{value} px</span>
      </span>
      <input
        className="collage__slider"
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={`${value} px`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function CollageScreen({ wallpapers }: { wallpapers?: Wallpaper[] }) {
  const screen = useScreenInfo();
  const scheme = useTheme((s) => s.scheme);
  const push = useNavigation((s) => s.push);
  const [layout, setLayout] = useState<LayoutId>(() => defaultLayout(wallpapers?.length ?? 0));
  const [slots, setSlots] = useState<Slots>(() => seedSlots(wallpapers ?? []));
  const [style, setStyle] = useState<CollageStyle>(DEFAULT_STYLE);
  const [tool, setTool] = useState<Tool>('layout');
  const [selected, setSelected] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [pickIndex, setPickIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = useRef<{ key: string; creation: Wallpaper } | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const checkedLayout = useRef<HTMLButtonElement>(null);

  const count = layoutInfo(layout).count;
  const visible = useMemo(() => slots.slice(0, count), [slots, count]);
  const filled = filledCount(slots, count);
  const ratio = screenRatio(screen);

  // Résolution de décodage : la plus grande case de la disposition, à l'échelle de l'écran.
  const requests = useMemo(() => {
    if (!screen) return [];
    const windows = layoutCells(layout, screen.width, screen.height, { gap: 0, radius: 0 }).map((cell) => {
      const view = photoWindow(cell);
      return { width: view.width, height: view.height };
    });
    const byId = new Map<string, { wallpaper: Wallpaper; width: number }>();
    for (const slot of visible) {
      if (!slot) continue;
      const width = decodeWidth(slot.wallpaper, windows);
      const known = byId.get(slot.wallpaper.id);
      if (!known || known.width < width) byId.set(slot.wallpaper.id, { wallpaper: slot.wallpaper, width });
    }
    return [...byId.values()];
  }, [screen, layout, visible]);
  const keep = useMemo(() => new Set(slots.flatMap((s) => (s ? [s.wallpaper.id] : []))), [slots]);
  const { photos, failed, retry } = useCollagePhotos(requests, keep);

  const drawn = useMemo<(DrawnPhoto | null)[]>(
    () =>
      visible.map((slot) => {
        const photo = slot ? photos[slot.wallpaper.id] : undefined;
        // Un bitmap libéré (largeur 0) ne se dessine pas.
        return slot && photo && photo.bitmap.width > 0 ? { source: photo.bitmap, size: photo.size, framing: slot.framing } : null;
      }),
    [visible, photos],
  );
  const ready = filled === count && drawn.every(Boolean);

  const dominants = visible.map((slot) =>
    slot ? (photos[slot.wallpaper.id]?.dominant ?? (slot.wallpaper.source === 'device' ? null : slot.wallpaper.color)) : null,
  );

  const draw = useMemo<Draw | null>(
    () =>
      screen
        ? (ctx, width, height) => renderCollage(ctx, layout, style, drawn, width, height, screenUnit(width, screen), { placeholders: true })
        : null,
    [screen, layout, style, drawn],
  );

  useEffect(() => {
    checkedLayout.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tool, layout]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Le bouton retour annule d'abord le mode « échanger » avant de fermer l'écran.
  useBackHandler(swapping, () => setSwapping(false));

  const patchStyle = (patch: Partial<CollageStyle>) => setStyle((s) => ({ ...s, ...patch }));

  const chooseLayout = (id: LayoutId) => {
    setLayout(id);
    const next = layoutInfo(id).count;
    setSelected((s) => (s !== null && s < next ? s : null));
    setSwapping(false);
  };

  const pick = (wallpaper: Wallpaper) => {
    if (pickIndex === null) return;
    retry(wallpaper.id);
    setSlots((s) => setPhoto(s, pickIndex, wallpaper));
    setSelected(pickIndex);
    setSwapping(false);
  };

  const tapCell = (index: number) => {
    if (swapping && selected !== null) {
      if (index !== selected) {
        setSlots((s) => swapPhotos(s, selected, index));
        setSelected(index);
      }
      setSwapping(false);
      return;
    }
    if (!slots[index]) {
      setSelected(null);
      setPickIndex(index);
      return;
    }
    setSelected(index);
  };

  const deselect = () => {
    setSelected(null);
    setSwapping(false);
  };

  const reset = () => {
    setStyle(DEFAULT_STYLE);
    setSlots(recenterAll);
  };

  const signature = JSON.stringify([layout, style, visible.map((s) => s && [s.wallpaper.id, s.framing])]);

  /** Exporte à la taille de l'écran puis range le résultat dans « Créations » (une seule fois si rien n'a changé). */
  const save = async (): Promise<Wallpaper | null> => {
    if (!screen || !ready || saving.current) return null;
    if (saved.current?.key === signature) return saved.current.creation;
    saving.current = true;
    setBusy(true);
    try {
      // Laisse la barre de progression s'afficher avant l'encodage, qui occupe le fil principal.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      // Un bitmap remplacé entre-temps (photo rechargée plus nette) est libéré : mieux vaut refuser que d'exporter un collage troué.
      if (drawn.some((photo) => !photo || photo.source.width === 0)) throw new Error('les photos viennent de changer, réessaie');
      const data = await exportCollage(layout, style, drawn, screen);
      const creation = await saveCreation(data, style.background, `Collage de ${count} photos`);
      saved.current = { key: signature, creation };
      // Les photos Unsplash quittent l'app dans le collage : Unsplash doit en être informé (comme pour un fond appliqué).
      for (const { source, downloadLocation } of usedWallpapers(slots, count)) {
        if (source === 'unsplash' && downloadLocation) void trackUnsplashDownload(downloadLocation);
      }
      return creation;
    } catch (e) {
      showSnackbar(`Enregistrement impossible : ${nativeErrorMessage(e)}`);
      return null;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const onSave = async () => {
    const creation = await save();
    if (creation) showSnackbar(SAVED_MESSAGE, { label: 'Voir', onAction: () => push({ type: 'preview', wallpaper: creation }) });
  };

  const onApply = async () => {
    const creation = await save();
    if (!creation) return;
    showSnackbar(SAVED_MESSAGE);
    // L'écran a pu être fermé pendant l'enregistrement : on ne rouvre pas l'aperçu dans ce cas.
    if (mounted.current) push({ type: 'preview', wallpaper: creation });
  };

  const selectedSlot = selected !== null ? (visible[selected] ?? null) : null;
  const groups = useMemo(() => backgroundGroups(dominants, scheme), [dominants.join('|'), scheme]);

  const anyFailed = visible.some((slot) => slot && failed[slot.wallpaper.id]);
  const hint =
    filled < count
      ? `${filled} case${filled > 1 ? 's' : ''} sur ${count} remplie${filled > 1 ? 's' : ''} : touche une case vide pour ajouter une photo.`
      : !ready
        ? anyFailed
          ? 'Une photo est indisponible : touche sa case pour la remplacer.'
          : 'Chargement des photos…'
        : 'Touche une case pour la modifier. Glisse, pince ou utilise la molette pour cadrer sa photo.';

  return (
    <div className="collage" role="dialog" aria-label="Collage">
      <header className="collage__top">
        <IconButton icon="close" label="Fermer le collage" onClick={goBack} />
        <h1 className="top-bar__title">Collage</h1>
        <Button variant="text" disabled={!ready || busy} onClick={() => void onSave()}>
          Enregistrer
        </Button>
      </header>

      {busy && (
        <div className="collage__progress">
          <LinearProgress label="Enregistrement du collage" />
        </div>
      )}

      {screen ? (
        <Stage busy={busy} ratio={ratio} draw={draw} ink={isLightColor(style.background) ? 'rgb(0 0 0 / 0.6)' : 'rgb(255 255 255 / 0.85)'} onBackground={deselect}>
          {(display) => {
            const unit = screenUnit(display.width, screen);
            const cells = layoutCells(layout, display.width, display.height, { gap: style.spacing * unit, radius: style.corners * unit });
            return cells.map((cell, i) => {
              const slot = visible[i] ?? null;
              const loaded = slot ? photos[slot.wallpaper.id] : undefined;
              const error = slot ? failed[slot.wallpaper.id] : undefined;
              return (
                <CollageCell
                  key={i}
                  cell={cell}
                  photo={slot ? { framing: slot.framing, size: loaded && loaded.bitmap.width > 0 ? loaded.size : null, failed: !!error } : null}
                  label={slot ? `Case ${i + 1} : ${slot.wallpaper.alt}` : `Case ${i + 1} : vide, ajouter une photo`}
                  selected={selected === i}
                  swapTarget={swapping && selected !== null && selected !== i}
                  onTap={() => tapCell(i)}
                  onFraming={(framing) => setSlots((s) => setSlotFraming(s, i, framing))}
                />
              );
            });
          }}
        </Stage>
      ) : (
        <div className="collage__stage">
          <Spinner />
        </div>
      )}

      <div className="collage__panel" inert={busy}>
        <div className="collage__cellbar">
          {swapping && selected !== null ? (
            <>
              <p className="collage__hint">Touche la case à échanger avec la case {selected + 1}.</p>
              <Button variant="text" onClick={() => setSwapping(false)}>
                Annuler
              </Button>
            </>
          ) : selected !== null && selectedSlot ? (
            <>
              <span className="collage__cellname">Case {selected + 1}</span>
              <IconButton icon="addPhoto" variant="tonal" label="Changer la photo" onClick={() => setPickIndex(selected)} />
              <IconButton icon="swap" variant="tonal" label="Échanger avec une autre case" disabled={count < 2} onClick={() => setSwapping(true)} />
              <IconButton
                icon="focus"
                variant="tonal"
                label="Recentrer la photo"
                disabled={isDefaultFraming(selectedSlot.framing)}
                onClick={() => setSlots((s) => setSlotFraming(s, selected, DEFAULT_FRAMING))}
              />
              <IconButton
                icon="delete"
                variant="tonal"
                label="Retirer la photo"
                onClick={() => {
                  setSlots((s) => clearPhoto(s, selected));
                  setSelected(null);
                }}
              />
            </>
          ) : (
            <p className="collage__hint">{hint}</p>
          )}
        </div>

        <div className="collage__controls">
          {tool === 'layout' && (
            <div className="collage__layouts" role="radiogroup" aria-label="Disposition">
              {LAYOUTS.map((l, i) => (
                <div key={l.id} className="collage__layout-item">
                  {i > 0 && LAYOUTS[i - 1]?.count !== l.count && <span className="collage__divider" aria-hidden="true" />}
                  <button
                    ref={layout === l.id ? checkedLayout : undefined}
                    type="button"
                    role="radio"
                    aria-checked={layout === l.id}
                    aria-label={l.description}
                    title={l.description}
                    className="layout-option state"
                    onClick={() => chooseLayout(l.id)}
                  >
                    <LayoutThumb id={l.id} ratio={ratio} />
                    <span className="layout-option__label" aria-hidden="true">
                      {l.label}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {tool === 'adjust' && (
            <div className="collage__sliders">
              <Range label="Espacement" value={style.spacing} max={SPACING_MAX} onChange={(spacing) => patchStyle({ spacing })} />
              <Range label="Coins arrondis" value={style.corners} max={CORNERS_MAX} onChange={(corners) => patchStyle({ corners })} />
            </div>
          )}
          {tool === 'background' && (
            <div className="collage__swatches" role="radiogroup" aria-label="Couleur de fond">
              {groups.map((group) => (
                <div key={group.id} className="collage__swatch-group">
                  {group.choices.map((choice) => {
                    const checked = sameColor(style.background, choice.color);
                    return (
                      <button
                        key={choice.label}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={choice.label}
                        title={choice.label}
                        className="collage__swatch"
                        style={{ background: choice.color, color: isLightColor(choice.color) ? '#000000' : '#ffffff' }}
                        onClick={() => patchStyle({ background: choice.color })}
                      >
                        {checked && <Icon name="check" size={18} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chip-row collage__tools" role="tablist" aria-label="Outils">
          {TOOLS.map((t) => (
            <Chip key={t.key} icon={t.icon} selected={tool === t.key} role="tab" aria-selected={tool === t.key} onClick={() => setTool(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="collage__actions">
          <Button variant="text" disabled={busy} onClick={reset}>
            Réinitialiser
          </Button>
          <Button icon="wallpaper" disabled={!ready || busy} onClick={() => void onApply()}>
            Appliquer
          </Button>
        </div>
      </div>

      <WallpaperPicker open={pickIndex !== null} title="Choisir une photo" onClose={() => setPickIndex(null)} onPick={pick} />
    </div>
  );
}
