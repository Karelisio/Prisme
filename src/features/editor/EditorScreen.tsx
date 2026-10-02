import { useEffect, useMemo, useRef, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { saveCreation } from '@/features/library/creations';
import { type ApplyChoice, ApplySheet } from '@/features/preview/ApplySheet';
import { applyCreation } from '@/features/preview/applyWallpaper';
import type { Wallpaper } from '@/features/sources/types';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { type NormalizedRect, nativeErrorMessage } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Chip, EmptyState, IconButton, Spinner, Switch } from '@/shared/ui/components';
import { FittedCanvas } from '@/shared/ui/FittedCanvas';
import type { IconName } from '@/shared/ui/icons';
import { showSnackbar } from '@/shared/ui/overlays';
import { Slider, Swatches } from './controls';
import { DEFAULT_EFFECT } from './effects';
import { EffectPanel } from './EffectPanel';
import { DEFAULT_FILTER } from './filters';
import { DEFAULT_FIT, isLandscape } from './fit';
import { FilterPanel } from './FilterPanel';
import { FitPanel } from './FitPanel';
import { FramePanel } from './FramePanel';
import { type Geometry, initialGeometry } from './geometry';
import { DEFAULT_EDIT, type EditParams, type GradientStyle, exportEdit, photoScale } from './render';
import { dominantPalette } from './sample';
import { type EditableImage, loadEditableImage } from './source';
import { useFraming } from './useFraming';
import { usePreviewRender } from './usePreviewRender';
import './editor.css';
import './tools.css';

type Tool = 'frame' | 'fit' | 'filter' | 'effect' | 'blur' | 'dim' | 'grain' | 'gradient' | 'text';

// Dans l'ordre du rendu : cadrage, ajustement, filtre, effet, puis les réglages.
const TOOLS: { key: Tool; label: string; icon: IconName }[] = [
  { key: 'frame', label: 'Recadrage', icon: 'cropRotate' },
  { key: 'fit', label: 'Ajustement', icon: 'aspectRatio' },
  { key: 'filter', label: 'Filtres', icon: 'filterVintage' },
  { key: 'effect', label: 'Effets', icon: 'wandStars' },
  { key: 'blur', label: 'Flou', icon: 'blur' },
  { key: 'dim', label: 'Assombrir', icon: 'contrast' },
  { key: 'grain', label: 'Grain', icon: 'grain' },
  { key: 'gradient', label: 'Dégradé', icon: 'gradient' },
  { key: 'text', label: 'Texte', icon: 'textFields' },
];

const GRADIENTS: { value: GradientStyle; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'top', label: 'En haut' },
  { value: 'bottom', label: 'En bas' },
  { value: 'vignette', label: 'Vignette' },
];

/** Réglages avant le chargement de la photo (la géométrie en dépend) : tout est neutre. */
const NEUTRAL: EditParams = { ...DEFAULT_EDIT, fit: DEFAULT_FIT, filter: DEFAULT_FILTER, effect: DEFAULT_EFFECT };

export function EditorScreen({ wallpaper, crop }: { wallpaper: Wallpaper; crop?: NormalizedRect }) {
  const screen = useScreenInfo();
  const scheme = useTheme((s) => s.scheme);
  const [image, setImage] = useState<EditableImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<EditParams>(NEUTRAL);
  const [tool, setTool] = useState<Tool>('blur');
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const replace = useNavigation((s) => s.replace);
  const output = useMemo(() => (screen ? { width: screen.width, height: screen.height } : null), [screen]);

  useEffect(() => {
    if (!output) return;
    let alive = true;
    loadEditableImage(wallpaper, crop, output).then(
      (img) => {
        if (!alive) {
          img.bitmap.close();
          return;
        }
        setImage(img);
        // Départ : photo droite, cadrée comme dans l'aperçu.
        setParams((p) => ({ ...p, geometry: initialGeometry(crop, img.size, output) }));
        // Photo en paysage : l'ajustement (photo entière) est proposé d'office.
        if (isLandscape(img.size)) setTool('fit');
      },
      (e) => alive && setError(nativeErrorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [wallpaper, crop, output]);

  useEffect(() => () => image?.bitmap.close(), [image]);

  // L'outil choisi reste visible dans la rangée défilante.
  useEffect(() => {
    toolsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tool]);

  const ratio = screenRatio(screen);
  const { draw, rendering, markDraft } = usePreviewRender(image, params);
  const palette = useMemo(() => (image ? dominantPalette(image.bitmap, image.size) : []), [image]);
  const fit = params.fit ?? DEFAULT_FIT;
  const effect = params.effect ?? DEFAULT_EFFECT;

  const set = (patch: Partial<EditParams>) => setParams((p) => ({ ...p, ...patch }));
  const setGeometry = (geometry: Geometry) => {
    set({ geometry });
    // Pendant un geste, l'effet artistique attend : la photo suit le doigt sans à-coup.
    markDraft();
  };

  const framingOn = tool === 'frame' && fit.mode === 'fill' && !!image && !busy;
  const framing = useFraming({ enabled: framingOn, source: image?.size ?? null, output, geometry: params.geometry, onChange: setGeometry });

  const reset = () => setParams(image && output ? { ...NEUTRAL, geometry: initialGeometry(crop, image.size, output) } : NEUTRAL);

  /**
   * Rendu à la taille de l'écran. Si le cadrage final réclame plus de pixels que l'image chargée pour
   * l'aperçu (photo tournée, zoom poussé), la photo est rechargée à la résolution utile, le temps de l'export.
   */
  const render = async (img: EditableImage, out: { width: number; height: number }): Promise<string> => {
    const needed = photoScale(params, img.size, undefined, out);
    if (needed > 1.05 && wallpaper.width > img.size.width * 1.05) {
      try {
        const sharp = await loadEditableImage(wallpaper, crop, out, Math.min(1, (img.size.width / wallpaper.width) * needed * 1.02));
        try {
          return await exportEdit(sharp.bitmap, sharp.size, undefined, params, out);
        } finally {
          sharp.bitmap.close();
        }
      } catch {
        // Rechargement impossible (réseau) : on exporte avec l'image déjà chargée.
      }
    }
    return exportEdit(img.bitmap, img.size, undefined, params, out);
  };

  const save = async (): Promise<Wallpaper | null> => {
    if (!image || !output) return null;
    setBusy(true);
    try {
      const data = await render(image, output);
      return await saveCreation(data, wallpaper.color, `Retouche de ${wallpaper.alt}`);
    } catch (e) {
      showSnackbar(`Enregistrement impossible : ${nativeErrorMessage(e)}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const creation = await save();
    if (creation) showSnackbar('Enregistré dans la collection « Créations »', { label: 'Voir', onAction: () => replace({ type: 'preview', wallpaper: creation }) });
  };

  const onApply = async (choice: ApplyChoice) => {
    setApplyOpen(false);
    const creation = await save();
    if (!creation) return;
    try {
      if (choice !== 'linked') showSnackbar(await applyCreation(creation, choice));
    } catch (e) {
      showSnackbar(`Échec : ${nativeErrorMessage(e)}`);
    }
  };

  return (
    <div className="editor" role="dialog" aria-label="Éditeur">
      <header className="editor__top">
        <IconButton icon="close" label="Fermer l'éditeur" onClick={goBack} />
        <h1 className="top-bar__title">Retoucher</h1>
        <Button variant="text" disabled={!image || busy} onClick={() => void onSave()}>
          Enregistrer
        </Button>
      </header>

      {error ? (
        <div className="editor__stage">
          <EmptyState icon="error" title="Image indisponible" text={error} />
        </div>
      ) : (
        <div className="editor__stage-wrap" ref={framing.ref} data-framing={framingOn ? 'true' : undefined} {...framing.handlers}>
          <FittedCanvas className="editor__stage" ratio={ratio} draw={image ? draw : null} label="Aperçu de la retouche" />
          {!image && (
            <div className="editor__loading">
              <Spinner />
            </div>
          )}
          {image && (rendering || busy) && (
            <div className="editor__rendering" role="status">
              <Spinner size={18} label="Rendu en cours" />
              Rendu…
            </div>
          )}
        </div>
      )}

      <div className="editor__panel" inert={busy}>
        <div className="editor__controls editor__controls--tools">
          {tool === 'frame' && image && output && params.geometry && (
            <FramePanel
              geometry={params.geometry}
              source={image.size}
              output={output}
              fills={fit.mode === 'fill'}
              onChange={setGeometry}
              onRestore={() => setGeometry(initialGeometry(crop, image.size, output))}
            />
          )}
          {tool === 'fit' && <FitPanel fit={fit} palette={palette} landscape={!!image && isLandscape(image.size)} onChange={(next) => set({ fit: next })} />}
          {tool === 'filter' && <FilterPanel image={image} params={params} ratio={ratio} scheme={scheme} onChange={(next) => set({ filter: next })} />}
          {tool === 'effect' && <EffectPanel effect={effect} onChange={(next) => set({ effect: next })} />}
          {tool === 'blur' && <Slider label="Intensité du flou" value={params.blur} onChange={(blur) => set({ blur })} />}
          {tool === 'dim' && <Slider label="Assombrissement" value={params.dim} onChange={(dim) => set({ dim })} />}
          {tool === 'grain' && <Slider label="Grain" value={params.grain} onChange={(grain) => set({ grain })} />}
          {tool === 'gradient' && (
            <>
              <div className="chip-wrap">
                {GRADIENTS.map((g) => (
                  <Chip key={g.value} selected={params.gradient.style === g.value} onClick={() => set({ gradient: { ...params.gradient, style: g.value } })}>
                    {g.label}
                  </Chip>
                ))}
              </div>
              {params.gradient.style !== 'none' && (
                <>
                  <Swatches label="Couleur du dégradé" value={params.gradient.color} onChange={(color) => set({ gradient: { ...params.gradient, color } })} />
                  <Slider label="Force du dégradé" value={params.gradient.strength} onChange={(strength) => set({ gradient: { ...params.gradient, strength } })} />
                </>
              )}
            </>
          )}
          {tool === 'text' && (
            <>
              <textarea
                className="editor__text"
                rows={2}
                maxLength={120}
                placeholder="Ton texte"
                aria-label="Texte"
                value={params.text.value}
                onChange={(e) => set({ text: { ...params.text, value: e.target.value } })}
              />
              <Slider label="Taille du texte" value={params.text.size} onChange={(size) => set({ text: { ...params.text, size } })} />
              <Slider label="Position verticale" value={params.text.position} onChange={(position) => set({ text: { ...params.text, position } })} />
              <div className="editor__row">
                <Swatches label="Couleur du texte" value={params.text.color} onChange={(color) => set({ text: { ...params.text, color } })} />
                <span className="editor__bold">
                  Gras
                  <Switch label="Texte en gras" checked={params.text.bold} onChange={(bold) => set({ text: { ...params.text, bold } })} />
                </span>
              </div>
            </>
          )}
        </div>

        <div ref={toolsRef} className="chip-row editor__tools" role="tablist" aria-label="Outils">
          {TOOLS.map((t) => (
            <Chip key={t.key} icon={t.icon} selected={tool === t.key} role="tab" aria-selected={tool === t.key} onClick={() => setTool(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="editor__actions">
          <Button variant="text" disabled={busy} onClick={reset}>
            Réinitialiser
          </Button>
          <Button icon="wallpaper" disabled={!image || busy} onClick={() => setApplyOpen(true)}>
            Appliquer
          </Button>
        </div>
      </div>

      <ApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} onApply={(c) => void onApply(c)} />
    </div>
  );
}
