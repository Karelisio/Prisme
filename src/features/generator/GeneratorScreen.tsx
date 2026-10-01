import { useCallback, useMemo, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { saveCreation } from '@/features/library/creations';
import { type ApplyChoice, ApplySheet } from '@/features/preview/ApplySheet';
import { applyCreation } from '@/features/preview/applyWallpaper';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { getScreenInfo, screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { nativeErrorMessage } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Chip, IconButton, Switch } from '@/shared/ui/components';
import { FittedCanvas } from '@/shared/ui/FittedCanvas';
import { showSnackbar } from '@/shared/ui/overlays';
import { CURATED_PALETTES, DEFAULT_GENERATOR, type GeneratorParams, STYLES, exportGenerated, randomize, renderGenerated, schemePalette } from './generate';
import '@/features/editor/editor.css';
import './generator.css';

export function GeneratorScreen() {
  const screen = useScreenInfo();
  const scheme = useTheme((s) => s.scheme);
  const enabled = useSettings((s) => s.features.generator);
  const setFeature = useSettings((s) => s.setFeature);
  const replace = useNavigation((s) => s.replace);
  const [params, setParams] = useState<GeneratorParams>(DEFAULT_GENERATOR);
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const palettes = useMemo(() => (scheme ? [schemePalette(scheme), ...CURATED_PALETTES] : [...CURATED_PALETTES]), [scheme]);
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => renderGenerated(ctx, params, w, h), [params]);
  const set = (patch: Partial<GeneratorParams>) => setParams((p) => ({ ...p, ...patch }));
  const setColor = (index: 0 | 1 | 2, color: string) => {
    const colors = [...params.colors] as GeneratorParams['colors'];
    colors[index] = color;
    set({ colors });
  };

  const save = async (): Promise<Wallpaper | null> => {
    setBusy(true);
    try {
      const { width, height } = await getScreenInfo();
      return await saveCreation(await exportGenerated(params, width, height), params.colors[0], 'Création minimaliste');
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
    <div className="editor" role="dialog" aria-label="Générateur">
      <header className="editor__top">
        <IconButton icon="arrowBack" label="Retour" onClick={goBack} />
        <h1 className="top-bar__title">Créer un fond</h1>
        <Switch label="Activer le générateur" checked={enabled} onChange={(v) => setFeature('generator', v)} />
        <Button variant="text" disabled={busy} onClick={() => void onSave()}>
          Enregistrer
        </Button>
      </header>

      <FittedCanvas className="editor__stage" ratio={screenRatio(screen)} draw={draw} label="Aperçu de la création" />

      <div className="editor__panel">
        <div className="editor__controls">
          <div className="chip-wrap" aria-label="Style">
            {STYLES.map((s) => (
              <Chip key={s.value} selected={params.style === s.value} onClick={() => set({ style: s.value })}>
                {s.label}
              </Chip>
            ))}
          </div>
          <div className="palette-row" aria-label="Palettes">
            {palettes.map((palette, i) => (
              <button
                key={palette.join('-')}
                type="button"
                className="palette-chip"
                aria-label={i === 0 && scheme ? 'Palette Material You' : `Palette ${i + 1}`}
                aria-pressed={palette.join() === params.colors.join()}
                style={{ background: `linear-gradient(135deg, ${palette[0]} 0 33%, ${palette[1]} 33% 66%, ${palette[2]} 66%)` }}
                onClick={() => set({ colors: palette })}
              />
            ))}
          </div>
          <div className="editor__row">
            <div className="color-inputs">
              {([0, 1, 2] as const).map((i) => (
                <input key={i} type="color" aria-label={`Couleur ${i + 1}`} value={params.colors[i]} onChange={(e) => setColor(i, e.target.value)} />
              ))}
            </div>
            <Button variant="tonal" icon="shuffle" onClick={() => set(randomize(params.seed + 1))}>
              Au hasard
            </Button>
          </div>
          {params.style === 'linear' && (
            <label className="editor__slider">
              <span>Angle</span>
              <input className="slider" type="range" min={0} max={360} step={5} value={params.angle} aria-label="Angle" onChange={(e) => set({ angle: Number(e.target.value) })} />
            </label>
          )}
          <label className="editor__slider">
            <span>Grain</span>
            <input className="slider" type="range" min={0} max={1} step={0.01} value={params.grain} aria-label="Grain" onChange={(e) => set({ grain: Number(e.target.value) })} />
          </label>
        </div>
        <div className="editor__actions">
          <Button variant="text" onClick={() => set({ seed: params.seed + 1 })}>
            Autre composition
          </Button>
          <Button icon="wallpaper" disabled={busy} onClick={() => setApplyOpen(true)}>
            Appliquer
          </Button>
        </div>
      </div>

      <ApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} onApply={(c) => void onApply(c)} />
    </div>
  );
}
