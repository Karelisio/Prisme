import { DEFAULT_EDIT, type EditParams, type Size, coverCrop, zoomCrop } from '@/features/editor/render';
import type { NormalizedRect } from '@/shared/native';

export type VariantKey = 'blur' | 'dim' | 'blurDim' | 'zoom' | 'mono';

export interface Variant {
  key: VariantKey;
  label: string;
  params: EditParams;
  /** Facteur de zoom appliqué au recadrage (variante « gros plan »). */
  zoom?: number;
}

export const VARIANTS: readonly Variant[] = [
  { key: 'blurDim', label: 'Flou et sombre', params: { ...DEFAULT_EDIT, blur: 0.35, dim: 0.35 } },
  { key: 'blur', label: 'Flouté', params: { ...DEFAULT_EDIT, blur: 0.5 } },
  { key: 'dim', label: 'Assombri', params: { ...DEFAULT_EDIT, dim: 0.5 } },
  { key: 'zoom', label: 'Gros plan', params: DEFAULT_EDIT, zoom: 1.8 },
  { key: 'mono', label: 'Noir et blanc', params: { ...DEFAULT_EDIT, grayscale: true } },
];

/** Recadrage de la variante : celui de l'aperçu (ou centré), resserré pour le gros plan. */
export function variantCrop(variant: Variant, image: Size, crop: NormalizedRect | undefined, screen: Size): NormalizedRect {
  const base = crop ?? coverCrop(image, screen.width / screen.height);
  return variant.zoom ? zoomCrop(base, variant.zoom) : base;
}
