import { useEffect, useRef } from 'react';
import { useSettings } from '@/features/settings/store';
import { useTheme } from '@/shared/theme/ThemeController';
import { MOTION_PALETTES, type MotionPalette, type MotionPaletteKey, paintMotionGradient, resolvePalette } from './motion';
import './motion.css';

/** Palettes du dégradé : une tuile avec un aperçu du fond pour chacune ([gain] : taches atténuées). */
export function PaletteTiles({
  label,
  value,
  onChange,
  gain = 1,
}: {
  label: string;
  value: MotionPaletteKey;
  onChange: (palette: MotionPaletteKey) => void;
  gain?: number;
}) {
  const system = useTheme((s) => s.system);
  const seed = useSettings((s) => s.seedColor);
  return (
    <div className="presets" role="group" aria-label={label}>
      {MOTION_PALETTES.map((p) => (
        <PaletteTile
          key={p.key}
          label={p.label}
          palette={resolvePalette(p.key, system, seed)}
          gain={gain}
          selected={value === p.key}
          onPick={() => onChange(p.key)}
        />
      ))}
    </div>
  );
}

function PaletteTile({ label, palette, gain, selected, onPick }: { label: string; palette: MotionPalette; gain: number; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = `${palette.base}|${palette.colors.join(',')}|${palette.gain}|${gain}`;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) paintMotionGradient(ctx, palette, canvas.width, canvas.height, 12, gain);
    // Repeint seulement quand les couleurs changent (l'objet palette est recréé à chaque rendu).
  }, [colors]);
  return (
    <button type="button" className="preset-tile motion-tile" aria-pressed={selected} aria-label={`Palette ${label}`} onClick={onPick}>
      <canvas ref={ref} width={90} height={200} className="preset" />
      <span>{label}</span>
    </button>
  );
}

/**
 * Palette « Material You » avant Android 12 : le natif reprend la couleur d'accent de l'app, envoyée avec
 * les réglages de la scène tant qu'elle sert ([needed]).
 */
export function useAccentSync(needed: boolean, accent: string | undefined, update: (patch: { accent: string }) => void) {
  const seed = useSettings((s) => s.seedColor);
  useEffect(() => {
    if (needed && accent !== seed) update({ accent: seed });
    // `update` change à chaque rendu : seules les valeurs comptent.
  }, [needed, accent, seed]);
}
