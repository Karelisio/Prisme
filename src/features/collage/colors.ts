/** Couleurs de fond proposées pour le collage : dominantes des photos, Material You, neutres. */
import { QuantizerCelebi, argbFromRgb, hexFromArgb } from '@material/material-color-utilities';
import { t } from '@/shared/i18n';
import type { ColorScheme } from '@/shared/theme/scheme';

/** Couleur la plus présente d'une image (pixels RGBA), ou null si elle est transparente. */
export function dominantFromPixels(rgba: ArrayLike<number>): string | null {
  const pixels: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 255) continue;
    pixels.push(argbFromRgb(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0));
  }
  if (pixels.length === 0) return null;
  let best = 0;
  let bestPopulation = -1;
  // Quantification Celebi (celle d'Android pour les couleurs dynamiques) : la teinte la plus peuplée l'emporte.
  for (const [argb, population] of QuantizerCelebi.quantize(pixels, 8)) {
    if (population > bestPopulation) {
      best = argb;
      bestPopulation = population;
    }
  }
  return hexFromArgb(best);
}

export interface BackgroundChoice {
  color: string;
  /** Intitulé accessible (dans la langue de l'interface). */
  label: string;
}

export interface BackgroundGroup {
  id: 'photos' | 'material' | 'neutral';
  label: string;
  choices: BackgroundChoice[];
}

/**
 * Pastilles de fond : une couleur dominante par photo (sans doublon), la palette Material You
 * du moment, puis blanc et noir. `dominants` suit l'ordre des cases (null = pas encore connue).
 */
export function backgroundGroups(dominants: readonly (string | null | undefined)[], scheme?: ColorScheme): BackgroundGroup[] {
  const groups: BackgroundGroup[] = [];
  const seen = new Set<string>();
  const photos: BackgroundChoice[] = [];
  dominants.forEach((color, i) => {
    if (!color || seen.has(color)) return;
    seen.add(color);
    photos.push({ color, label: t('Couleur dominante de la photo {n}', { n: i + 1 }) });
  });
  if (photos.length > 0) groups.push({ id: 'photos', label: t('Photos'), choices: photos });
  if (scheme) {
    groups.push({
      id: 'material',
      label: 'Material You',
      choices: [
        { color: scheme.primary, label: t('Material You : couleur principale') },
        { color: scheme.primaryContainer, label: t('Material You : principale adoucie') },
        { color: scheme.secondaryContainer, label: t('Material You : secondaire') },
        { color: scheme.tertiaryContainer, label: t('Material You : tertiaire') },
        { color: scheme.inverseSurface, label: t('Material You : surface inversée') },
      ],
    });
  }
  groups.push({
    id: 'neutral',
    label: t('Neutres'),
    choices: [
      { color: '#ffffff', label: t('Blanc') },
      { color: '#000000', label: t('Noir') },
    ],
  });
  return groups;
}

/** Vrai si le texte ou l'icône posés sur cette couleur doivent être sombres. */
export function isLightColor(hex: string): boolean {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
}
