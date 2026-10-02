import { useCallback, useMemo, useState } from 'react';
import { goBack, useNavigation } from '@/app/navigation';
import { saveCreation } from '@/features/library/creations';
import { type ApplyChoice, ApplySheet } from '@/features/preview/ApplySheet';
import { applyCreation } from '@/features/preview/applyWallpaper';
import { useSettings } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import { getScreenInfo, screenRatio, useScreenInfo } from '@/shared/lib/screen';
import { nativeErrorMessage } from '@/shared/native';
import { useTheme } from '@/shared/theme/ThemeController';
import { Button, Chip, IconButton, type SegmentOption, SegmentedButtons, Switch } from '@/shared/ui/components';
import { FittedCanvas } from '@/shared/ui/FittedCanvas';
import { showSnackbar } from '@/shared/ui/overlays';
import {
  CONTROL_RANGES,
  CURATED_PALETTES,
  type ControlKey,
  DEFAULT_GENERATOR,
  type GeneratorParams,
  STYLES,
  STYLE_CONTROLS,
  STYLE_GROUPS,
  applyStyle,
  exportGenerated,
  nextSeed,
  randomize,
  renderGenerated,
  resolveSettings,
  schemeAccents,
  schemePalette,
} from './generate';
import { GEOMETRIC_SHAPES } from './patterns';
import '@/features/editor/editor.css';
import './generator.css';

interface PaletteChoice {
  colors: GeneratorParams['colors'];
  accents?: GeneratorParams['accents'];
}

const POINT_OPTIONS: readonly SegmentOption<'4' | '5' | '6'>[] = [
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
];

function Slider({ label, value, min = 0, max = 1, step = 0.01, unit, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="generator__slider">
      <span className="generator__slider-head">
        <span>{label}</span>
        {unit && <output>{`${Math.round(value)}${unit}`}</output>}
      </span>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function GeneratorScreen() {
  const screen = useScreenInfo();
  const scheme = useTheme((s) => s.scheme);
  const enabled = useSettings((s) => s.features.generator);
  const setFeature = useSettings((s) => s.setFeature);
  const replace = useNavigation((s) => s.replace);
  const [params, setParams] = useState<GeneratorParams>(DEFAULT_GENERATOR);
  const [busy, setBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const palettes = useMemo<PaletteChoice[]>(() => {
    const curated = CURATED_PALETTES.map((colors) => ({ colors }));
    return scheme ? [{ colors: schemePalette(scheme), accents: schemeAccents(scheme) }, ...curated] : curated;
  }, [scheme]);
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => renderGenerated(ctx, params, w, h), [params]);
  const set = (patch: Partial<GeneratorParams>) => setParams((p) => ({ ...p, ...patch }));
  const setColor = (index: 0 | 1 | 2, color: string) => {
    const colors = [...params.colors] as GeneratorParams['colors'];
    colors[index] = color;
    // Modifier une couleur à la main : les teintes d'appoint sont de nouveau dérivées des trois couleurs.
    set({ colors, accents: undefined });
  };

  const settings = resolveSettings(params);
  const controls = STYLE_CONTROLS[params.style];
  const hasControl = (key: ControlKey) => controls.some((c) => c.key === key);
  const labelOf = (key: ControlKey) => t(controls.find((c) => c.key === key)?.label ?? '');
  const sliderKeys = controls.filter((c) => c.key !== 'shape' && c.key !== 'points');

  const sliderValue = (key: ControlKey): number => (key === 'angle' ? params.angle : key === 'shape' || key === 'points' ? 0 : settings[key]);
  const sliderRange = (key: ControlKey) => (key === 'angle' ? CONTROL_RANGES.angle : key === 'rotation' ? CONTROL_RANGES.rotation : CONTROL_RANGES.unit);
  const setSlider = (key: ControlKey, value: number) => {
    if (key === 'angle') set({ angle: value });
    else if (key === 'scale') set({ scale: value });
    else if (key === 'thickness') set({ thickness: value });
    else if (key === 'rotation') set({ rotation: value });
    else if (key === 'softness') set({ softness: value });
  };

  const save = async (): Promise<Wallpaper | null> => {
    setBusy(true);
    try {
      const { width, height } = await getScreenInfo();
      return await saveCreation(await exportGenerated(params, width, height), params.colors[0], t('Création minimaliste'));
    } catch (e) {
      showSnackbar(t('Enregistrement impossible : {message}', { message: nativeErrorMessage(e) }));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const creation = await save();
    if (creation) showSnackbar(t('Enregistré dans la collection « Créations »'), { label: t('Voir'), onAction: () => replace({ type: 'preview', wallpaper: creation }) });
  };

  const onApply = async (choice: ApplyChoice) => {
    setApplyOpen(false);
    const creation = await save();
    if (!creation) return;
    try {
      if (choice !== 'linked') showSnackbar(await applyCreation(creation, choice));
    } catch (e) {
      showSnackbar(t('Échec : {message}', { message: nativeErrorMessage(e) }));
    }
  };

  return (
    <div className="editor generator" role="dialog" aria-label={t('Générateur')}>
      <header className="editor__top">
        <IconButton icon="arrowBack" label={t('Retour')} onClick={goBack} />
        <h1 className="top-bar__title">{t('Créer un fond')}</h1>
        <Switch label={t('Activer le générateur')} checked={enabled} onChange={(v) => setFeature('generator', v)} />
        <Button variant="text" disabled={busy} onClick={() => void onSave()}>
          {t('Enregistrer')}
        </Button>
      </header>

      <FittedCanvas className="editor__stage" ratio={screenRatio(screen)} draw={draw} label={t('Aperçu de la création')} />

      <div className="editor__panel generator__panel">
        <div className="editor__controls generator__controls">
          <div className="generator__styles" aria-label={t('Style')}>
            {STYLE_GROUPS.map((group) => (
              <div key={group.value} className="generator__group" role="group" aria-label={t(group.label)}>
                <span className="generator__group-label">{t(group.label)}</span>
                <div className="generator__chips">
                  {STYLES.filter((s) => s.group === group.value).map((s) => (
                    <Chip key={s.value} selected={params.style === s.value} onClick={() => setParams((p) => (p.style === s.value ? p : applyStyle(p, s.value)))}>
                      {t(s.label)}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="palette-row" aria-label={t('Palettes')}>
            {palettes.map((palette, i) => (
              <button
                key={palette.colors.join('-')}
                type="button"
                className="palette-chip"
                aria-label={i === 0 && scheme ? t('Palette Material You') : t('Palette {number}', { number: i + 1 })}
                aria-pressed={palette.colors.join() === params.colors.join()}
                style={{ background: `linear-gradient(135deg, ${palette.colors[0]} 0 33%, ${palette.colors[1]} 33% 66%, ${palette.colors[2]} 66%)` }}
                onClick={() => set({ colors: palette.colors, accents: palette.accents })}
              />
            ))}
          </div>
          <div className="editor__row">
            <div className="color-inputs">
              {([0, 1, 2] as const).map((i) => (
                <input key={i} type="color" aria-label={t('Couleur {number}', { number: i + 1 })} value={params.colors[i]} onChange={(e) => setColor(i, e.target.value)} />
              ))}
            </div>
            <Button variant="tonal" icon="shuffle" onClick={() => set(randomize(params.seed + 1))}>
              {t('Au hasard')}
            </Button>
          </div>

          <div className="generator__settings">
            {hasControl('shape') && (
              <div className="generator__field generator__field--wide">
                <span className="generator__field-label">{labelOf('shape')}</span>
                <SegmentedButtons
                  options={GEOMETRIC_SHAPES.map((shape) => ({ ...shape, label: t(shape.label) }))}
                  value={settings.shape}
                  label={t('Forme des tuiles')}
                  onChange={(shape) => set({ shape })}
                />
              </div>
            )}
            {hasControl('points') && (
              <div className="generator__field generator__field--wide">
                <span className="generator__field-label">{labelOf('points')}</span>
                <SegmentedButtons options={POINT_OPTIONS} value={String(settings.points) as '4' | '5' | '6'} label={t('Nombre de points')} onChange={(points) => set({ points: Number(points) })} />
              </div>
            )}
            {sliderKeys.map(({ key, label }) => {
              const range = sliderRange(key);
              return <Slider key={key} label={t(label)} value={sliderValue(key)} min={range.min} max={range.max} step={range.step} unit={range.unit} onChange={(v) => setSlider(key, v)} />;
            })}
            <Slider label={t('Grain')} value={params.grain} onChange={(grain) => set({ grain })} />
          </div>
        </div>
        <div className="editor__actions">
          <Button variant="text" icon="refresh" onClick={() => set({ seed: nextSeed(params.seed) })}>
            {t('Varier')}
          </Button>
          <Button icon="wallpaper" disabled={busy} onClick={() => setApplyOpen(true)}>
            {t('Appliquer')}
          </Button>
        </div>
      </div>

      <ApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} onApply={(c) => void onApply(c)} />
    </div>
  );
}
