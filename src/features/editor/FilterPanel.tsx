import { useMemo } from 'react';
import { t } from '@/shared/i18n';
import type { ColorScheme } from '@/shared/theme/scheme';
import { Slider } from './controls';
import {
  DEFAULT_FILTER,
  DUOTONE_PRESETS,
  type DuotoneColors,
  type DuotonePreset,
  FILTERS,
  type FilterKind,
  type FilterParams,
  materialDuotones,
} from './filters';
import { type EditParams, DEFAULT_EDIT, renderEdit } from './render';
import type { EditableImage } from './source';

/** Largeur (px) des vignettes : rendues par le vrai pipeline, donc fidèles au résultat. */
const THUMB_WIDTH = 96;

/** Vignette de chaque filtre (data URL), sur la photo telle qu'elle est cadrée. Seulement quand le panneau est ouvert. */
function useFilterThumbs(image: EditableImage | null, params: EditParams, ratio: number): Partial<Record<FilterKind, string>> {
  const { geometry, fit } = params;
  const duotone = params.filter?.duotone ?? DEFAULT_FILTER.duotone;
  return useMemo(() => {
    if (!image) return {};
    const width = THUMB_WIDTH;
    const height = Math.max(1, Math.round(width * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return {};
    const thumbs: Partial<Record<FilterKind, string>> = {};
    for (const { kind } of FILTERS) {
      renderEdit(ctx, image.bitmap, image.size, undefined, { ...DEFAULT_EDIT, geometry, fit, filter: { kind, intensity: 1, duotone } }, width, height);
      thumbs[kind] = canvas.toDataURL('image/jpeg', 0.72);
    }
    canvas.width = canvas.height = 0;
    return thumbs;
  }, [image, geometry, fit, duotone, ratio]);
}

const sameDuotone = (a: DuotoneColors, b: DuotoneColors) => a.shadow.toLowerCase() === b.shadow.toLowerCase() && a.highlight.toLowerCase() === b.highlight.toLowerCase();

function DuotonePicker({ colors, presets, onChange }: { colors: DuotoneColors; presets: readonly DuotonePreset[]; onChange: (c: DuotoneColors) => void }) {
  return (
    <div className="editor__duotone">
      <div className="editor__presets" role="group" aria-label={t('Préréglages duotone')}>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="editor__preset"
            aria-label={t('Préréglage {name}', { name: t(p.label) })}
            title={t(p.label)}
            aria-pressed={sameDuotone(colors, p)}
            style={{ background: `linear-gradient(135deg, ${p.shadow} 0 50%, ${p.highlight} 50% 100%)` }}
            onClick={() => onChange({ shadow: p.shadow, highlight: p.highlight })}
          />
        ))}
      </div>
      <div className="editor__color-pair">
        <input type="color" className="editor__color" aria-label={t('Couleur des ombres')} value={colors.shadow} onChange={(e) => onChange({ ...colors, shadow: e.target.value })} />
        <input type="color" className="editor__color" aria-label={t('Couleur des lumières')} value={colors.highlight} onChange={(e) => onChange({ ...colors, highlight: e.target.value })} />
      </div>
    </div>
  );
}

export function FilterPanel({
  image,
  params,
  ratio,
  scheme,
  onChange,
}: {
  image: EditableImage | null;
  params: EditParams;
  /** Hauteur / largeur de l'écran. */
  ratio: number;
  /** Palette Material You du thème, quand elle est connue. */
  scheme: ColorScheme | undefined;
  onChange: (filter: FilterParams) => void;
}) {
  const filter = params.filter ?? DEFAULT_FILTER;
  const thumbs = useFilterThumbs(image, params, ratio);
  const presets = useMemo(() => (scheme ? [...materialDuotones(scheme), ...DUOTONE_PRESETS] : DUOTONE_PRESETS), [scheme]);

  return (
    <>
      <div className="editor__filters" role="group" aria-label={t('Filtres photo')}>
        {FILTERS.map(({ kind, label }) => (
          <button key={kind} type="button" className="filter-thumb" aria-pressed={filter.kind === kind} onClick={() => onChange({ ...filter, kind })}>
            {thumbs[kind] ? <img src={thumbs[kind]} alt="" draggable={false} /> : <span className="filter-thumb__empty" />}
            <span>{t(label)}</span>
          </button>
        ))}
      </div>
      <Slider label={t('Intensité du filtre')} value={filter.intensity} disabled={filter.kind === 'none'} onChange={(intensity) => onChange({ ...filter, intensity })} />
      {filter.kind === 'duotone' && <DuotonePicker colors={filter.duotone} presets={presets} onChange={(duotone) => onChange({ ...filter, duotone })} />}
    </>
  );
}
