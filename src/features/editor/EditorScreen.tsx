import { useCallback, useEffect, useMemo, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { saveCreation } from '@/features/library/creations';
import { setLiveWallpaper } from '@/features/live/live';
import { type ApplyChoice, ApplySheet } from '@/features/preview/ApplySheet';
import { TARGET_LABELS, applyWallpaper } from '@/features/preview/applyWallpaper';
import type { Wallpaper } from '@/features/sources/types';
import { screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { type NormalizedRect, nativeErrorMessage } from '@/shared/native';
import { Button, Chip, EmptyState, IconButton, Spinner, Switch } from '@/shared/ui/components';
import { FittedCanvas } from '@/shared/ui/FittedCanvas';
import type { IconName } from '@/shared/ui/icons';
import { showSnackbar } from '@/shared/ui/overlays';
import { DEFAULT_EDIT, type EditParams, type GradientStyle, exportEdit, renderEdit } from './render';
import { type EditableImage, loadEditableImage } from './source';
import './editor.css';

type Tool = 'blur' | 'dim' | 'grain' | 'gradient' | 'text' | 'mono';

const TOOLS: { key: Tool; label: string; icon: IconName }[] = [
  { key: 'blur', label: 'Flou', icon: 'blur' },
  { key: 'dim', label: 'Assombrir', icon: 'contrast' },
  { key: 'grain', label: 'Grain', icon: 'grain' },
  { key: 'gradient', label: 'Dégradé', icon: 'gradient' },
  { key: 'text', label: 'Texte', icon: 'textFields' },
  { key: 'mono', label: 'Noir et blanc', icon: 'filter' },
];

const GRADIENTS: { value: GradientStyle; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'top', label: 'En haut' },
  { value: 'bottom', label: 'En bas' },
  { value: 'vignette', label: 'Vignette' },
];

const SWATCHES = ['#000000', '#ffffff', '#1b1530', '#6750a4', '#0061a4', '#9c4146', '#386a20', '#f5c26b'];

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="editor__slider">
      <span>{label}</span>
      <input className="slider" type="range" min={0} max={1} step={0.01} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="editor__swatches" role="radiogroup" aria-label={label}>
      {SWATCHES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className="seed seed--small" style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function EditorScreen({ wallpaper, crop }: { wallpaper: Wallpaper; crop?: NormalizedRect }) {
  const screen = useScreenInfo();
  const [image, setImage] = useState<EditableImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<EditParams>(DEFAULT_EDIT);
  const [tool, setTool] = useState<Tool>('blur');
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const replace = useNavigation((s) => s.replace);
  const output = useMemo(() => (screen ? { width: screen.width, height: screen.height } : null), [screen]);

  useEffect(() => {
    if (!output) return;
    let alive = true;
    loadEditableImage(wallpaper, crop, output).then(
      (img) => (alive ? setImage(img) : img.bitmap.close()),
      (e) => alive && setError(nativeErrorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [wallpaper, crop, output]);

  useEffect(() => () => image?.bitmap.close(), [image]);

  const ratio = screenRatio(screen);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      if (image) renderEdit(ctx, image.bitmap, image.size, crop, params, width, height);
    },
    [image, params, crop],
  );

  const set = (patch: Partial<EditParams>) => setParams((p) => ({ ...p, ...patch }));

  const save = async (): Promise<Wallpaper | null> => {
    if (!image || !output) return null;
    setBusy(true);
    try {
      const data = await exportEdit(image.bitmap, image.size, crop, params, output);
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
      if (choice === 'live') showSnackbar(await setLiveWallpaper(creation));
      else {
        await applyWallpaper({ wallpaper: creation, target: choice });
        showSnackbar(`Fond appliqué : ${TARGET_LABELS[choice].toLowerCase()}`);
      }
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
        <div className="editor__stage-wrap">
          <FittedCanvas className="editor__stage" ratio={ratio} draw={image ? draw : null} label="Aperçu de la retouche" />
          {!image && (
            <div className="editor__loading">
              <Spinner />
            </div>
          )}
        </div>
      )}

      <div className="editor__panel">
        <div className="editor__controls">
          {tool === 'blur' && <Slider label="Intensité du flou" value={params.blur} onChange={(blur) => set({ blur })} />}
          {tool === 'dim' && <Slider label="Assombrissement" value={params.dim} onChange={(dim) => set({ dim })} />}
          {tool === 'grain' && <Slider label="Grain" value={params.grain} onChange={(grain) => set({ grain })} />}
          {tool === 'mono' && (
            <div className="editor__row">
              <span>Noir et blanc</span>
              <Switch label="Noir et blanc" checked={params.grayscale} onChange={(grayscale) => set({ grayscale })} />
            </div>
          )}
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

        <div className="chip-row editor__tools" role="tablist" aria-label="Outils">
          {TOOLS.map((t) => (
            <Chip key={t.key} icon={t.icon} selected={tool === t.key} role="tab" aria-selected={tool === t.key} onClick={() => setTool(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
        <div className="editor__actions">
          <Button variant="text" disabled={busy} onClick={() => setParams(DEFAULT_EDIT)}>
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
