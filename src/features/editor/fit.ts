import { type Geometry, type Placement, type Size, backdropPlacement, containPlacement, resolvePlacement } from './geometry';

/**
 * Ajustement de la photo dans l'écran :
 * - `fill` : la photo remplit l'écran, la zone choisie est recadrée (comportement historique) ;
 * - `blur` : photo entière centrée sur une copie agrandie et très floutée d'elle-même ;
 * - `color` : photo entière centrée sur un fond uni (couleur dominante, ou choisie).
 */
export type FitMode = 'fill' | 'blur' | 'color';

export interface FitParams {
  mode: FitMode;
  /** Couleur des bords du mode `color` ; null = couleur dominante de la photo. */
  color: string | null;
}

export const DEFAULT_FIT: FitParams = { mode: 'fill', color: null };

/** Libellés en français : traduits à l'affichage (`t`). */
export const FIT_MODES: readonly { mode: FitMode; label: string }[] = [
  { mode: 'fill', label: 'Remplir (recadrer)' },
  { mode: 'blur', label: 'Entière, bords flous' },
  { mode: 'color', label: 'Entière, couleur dominante' },
];

/** Écart-type du flou de la copie agrandie, en proportion de la largeur de sortie. */
export const BACKDROP_BLUR = 0.06;

/** Photo en paysage : c'est là que « Remplir » rogne le plus, l'éditeur propose donc l'ajustement d'office. */
export function isLandscape(size: Size): boolean {
  return size.width > size.height;
}

export interface FitLayout {
  /** Où dessiner la photo. */
  photo: Placement;
  /** Copie agrandie à flouter derrière la photo (mode `blur`). */
  backdrop: Placement | null;
}

export function fitLayout(mode: FitMode, source: Size, geometry: Geometry, out: Size): FitLayout {
  if (mode === 'fill') return { photo: resolvePlacement(source, geometry, out), backdrop: null };
  return { photo: containPlacement(source, geometry, out), backdrop: mode === 'blur' ? backdropPlacement(source, geometry, out) : null };
}
