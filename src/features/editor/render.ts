import { drawGrain } from '@/shared/lib/noise';
import type { NormalizedRect } from '@/shared/native';
import { DEFAULT_EFFECT, type EffectParams, type Steps, UPSCALE_SMOOTH, drain, drainAsync, isEffectActive, runEffect } from './effects';
import { DEFAULT_FILTER, type FilterParams, applyFilter, isFilterActive } from './filters';
import { BACKDROP_BLUR, DEFAULT_FIT, type FitParams, fitLayout } from './fit';
import { type Geometry, type Placement, type Size, initialGeometry, isReoriented, orientationMatrix } from './geometry';
import { dominantColorOf } from './sample';

export type { Size } from './geometry';

export type GradientStyle = 'none' | 'top' | 'bottom' | 'vignette';

export interface EditParams {
  /** 0..1 */
  blur: number;
  dim: number;
  grain: number;
  /** Ancien réglage « noir et blanc » : équivaut au filtre « Noir et blanc » à pleine intensité. */
  grayscale: boolean;
  gradient: { style: GradientStyle; color: string; strength: number };
  text: { value: string; size: number; color: string; position: number; bold: boolean };
  /** Rotation, miroir, redressement et zone choisie ; absent : zone du recadrage reçu, photo droite. */
  geometry?: Geometry;
  /** Ajustement de la photo dans l'écran ; absent : « Remplir ». */
  fit?: FitParams;
  /** Filtre photo ; absent : aucun. */
  filter?: FilterParams;
  /** Effet artistique ; absent : aucun. */
  effect?: EffectParams;
}

export const DEFAULT_EDIT: EditParams = {
  blur: 0,
  dim: 0,
  grain: 0,
  grayscale: false,
  gradient: { style: 'none', color: '#000000', strength: 0.6 },
  text: { value: '', size: 0.4, color: '#ffffff', position: 0.5, bold: true },
};

/** Réglages complets, tels que le rendu les lit. */
export interface ResolvedEdit {
  blur: number;
  dim: number;
  grain: number;
  gradient: EditParams['gradient'];
  text: EditParams['text'];
  geometry: Geometry | undefined;
  fit: FitParams;
  filter: FilterParams;
  effect: EffectParams;
}

const MONO_FULL: FilterParams = { ...DEFAULT_FILTER, kind: 'mono', intensity: 1 };

/**
 * Complète les réglages (les groupes ajoutés après coup peuvent manquer) et migre l'ancien « noir et
 * blanc » (`grayscale`) vers le filtre du même nom. Si un filtre est déjà choisi, il l'emporte.
 */
export function resolveEdit(p: EditParams): ResolvedEdit {
  const filter = p.filter ?? DEFAULT_FILTER;
  return {
    blur: p.blur,
    dim: p.dim,
    grain: p.grain,
    gradient: p.gradient,
    text: p.text,
    geometry: p.geometry,
    fit: p.fit ?? DEFAULT_FIT,
    filter: isFilterActive(filter) || !p.grayscale ? filter : MONO_FULL,
    effect: p.effect ?? DEFAULT_EFFECT,
  };
}

/** Étapes du rendu, dans l'ordre où elles s'appliquent (identique pour l'aperçu et l'export). */
export type Stage = 'geometry' | 'fit' | 'filter' | 'effect' | 'blur' | 'dim' | 'gradient' | 'grain' | 'text';

export const PIPELINE: readonly Stage[] = ['geometry', 'fit', 'filter', 'effect', 'blur', 'dim', 'gradient', 'grain', 'text'];

/** Étapes réellement actives pour ces réglages, dans l'ordre du rendu. */
export function activeStages(params: EditParams): Stage[] {
  const p = resolveEdit(params);
  const on: Record<Stage, boolean> = {
    geometry: p.geometry !== undefined,
    fit: p.fit.mode !== 'fill',
    filter: isFilterActive(p.filter),
    effect: isEffectActive(p.effect),
    blur: p.blur > 0,
    dim: p.dim > 0,
    gradient: p.gradient.style !== 'none' && p.gradient.strength > 0,
    grain: p.grain > 0,
    text: p.text.value.trim() !== '',
  };
  return PIPELINE.filter((stage) => on[stage]);
}

/** Vrai si un effet artistique est actif (calcul long : à fractionner). */
export function hasEffect(params: EditParams): boolean {
  return isEffectActive(resolveEdit(params).effect);
}

/** Aucune retouche : ni réglage, ni filtre, ni effet, ni texte, photo ni tournée ni détourée du cadre. */
export function isNeutral(params: EditParams): boolean {
  const p = resolveEdit(params);
  return (
    p.blur === 0 &&
    p.dim === 0 &&
    p.grain === 0 &&
    !isFilterActive(p.filter) &&
    !isEffectActive(p.effect) &&
    p.fit.mode === 'fill' &&
    !isReoriented(p.geometry) &&
    p.gradient.style === 'none' &&
    !p.text.value.trim()
  );
}

/**
 * Échelle du rendu final : pixels de sortie par pixel de la photo chargée. Au-delà de 1, la photo est
 * agrandie : l'éditeur recharge alors une version plus définie pour l'export.
 */
export function photoScale(params: EditParams, sourceSize: Size, crop: NormalizedRect | undefined, out: Size): number {
  const p = resolveEdit(params);
  if (!p.geometry && p.fit.mode === 'fill') {
    const c = effectiveCrop(sourceSize, crop, out.width, out.height);
    return out.width / (c.width * sourceSize.width);
  }
  return fitLayout(p.fit.mode, sourceSize, p.geometry ?? initialGeometry(crop, sourceSize, out), out).photo.scale;
}

/** Plus grande zone centrée de l'image au ratio voulu (comportement « cover »), normalisée. */
export function coverCrop(source: Size, targetAspect: number): NormalizedRect {
  const sourceAspect = source.width / source.height;
  if (sourceAspect > targetAspect) {
    const width = targetAspect / sourceAspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = sourceAspect / targetAspect;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

/** Resserre un recadrage autour de son centre (variante « zoom » des fonds liés). */
export function zoomCrop(crop: NormalizedRect, factor: number): NormalizedRect {
  const f = Math.max(1, factor);
  const width = crop.width / f;
  const height = crop.height / f;
  return { x: crop.x + (crop.width - width) / 2, y: crop.y + (crop.height - height) / 2, width, height };
}

/** Zone source effectivement dessinée : recadrage demandé, sinon « cover » au ratio de sortie. */
export function effectiveCrop(source: Size, crop: NormalizedRect | undefined, width: number, height: number): NormalizedRect {
  return crop ?? coverCrop(source, width / height);
}

export function textFontSize(size: number, width: number): number {
  return Math.round((0.04 + size * 0.1) * width);
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Canevas de travail ; `readback` : lectures de pixels fréquentes (calcul sur ImageData). */
function createSurface(width: number, height: number, readback = false): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!ctx) throw new Error('Canvas indisponible');
  return { canvas, ctx };
}

/** Rend la mémoire d'un canevas de travail sans attendre le ramasse-miettes. */
function release(surface: Surface) {
  surface.canvas.width = surface.canvas.height = 0;
}

/** Dessine la photo orientée à l'endroit voulu : centre au milieu de la sortie, échelle et inclinaison du placement. */
function drawPlaced(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceSize: Size, geometry: Geometry, placement: Placement, out: Size) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(out.width / 2, out.height / 2);
  if (placement.angle) ctx.rotate((placement.angle * Math.PI) / 180);
  ctx.scale(placement.scale, placement.scale);
  ctx.translate(-placement.cx, -placement.cy);
  ctx.transform(...orientationMatrix(sourceSize, geometry.turns, geometry.mirror));
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

/** La copie agrandie du mode « bords flous » est floutée sur une version réduite : même rendu, bien moins de calcul. */
const BACKDROP_REDUCTION = 8;

function drawBackdrop(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceSize: Size, geometry: Geometry, placement: Placement, out: Size) {
  const k = 1 / BACKDROP_REDUCTION;
  const sigma = Math.max(1, BACKDROP_BLUR * out.width * k);
  // Marge autour de la zone utile : le flou n'y pâlit pas les bords, on la rogne ensuite.
  const margin = Math.ceil(sigma * 3);
  const w = Math.max(1, Math.ceil(out.width * k));
  const h = Math.max(1, Math.ceil(out.height * k));
  const big = { width: w + margin * 2, height: h + margin * 2 };
  const sharp = createSurface(big.width, big.height);
  drawPlaced(sharp.ctx, source, sourceSize, geometry, { ...placement, scale: placement.scale * k }, big);
  const soft = createSurface(big.width, big.height);
  soft.ctx.filter = `blur(${sigma.toFixed(2)}px)`;
  soft.ctx.drawImage(sharp.canvas, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft.canvas, margin, margin, w, h, 0, 0, out.width, out.height);
  ctx.restore();
  release(sharp);
  release(soft);
}

/** Étapes 1 et 2 : géométrie (cadrage, rotation) et ajustement (remplir, ou photo entière sur fond). */
function drawBase(ctx: CanvasRenderingContext2D, source: CanvasImageSource, sourceSize: Size, crop: NormalizedRect | undefined, p: ResolvedEdit, width: number, height: number) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (!p.geometry && p.fit.mode === 'fill') {
    // Chemin historique : zone du recadrage reçu, sans rotation.
    const c = effectiveCrop(sourceSize, crop, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, c.x * sourceSize.width, c.y * sourceSize.height, c.width * sourceSize.width, c.height * sourceSize.height, 0, 0, width, height);
    ctx.restore();
    return;
  }
  const out = { width, height };
  const geometry = p.geometry ?? initialGeometry(crop, sourceSize, out);
  const layout = fitLayout(p.fit.mode, sourceSize, geometry, out);
  if (layout.backdrop) {
    drawBackdrop(ctx, source, sourceSize, geometry, layout.backdrop, out);
  } else if (p.fit.mode === 'color') {
    ctx.fillStyle = p.fit.color ?? dominantColorOf(source, sourceSize);
    ctx.fillRect(0, 0, width, height);
  }
  drawPlaced(ctx, source, sourceSize, geometry, layout.photo, out);
  ctx.restore();
}

/** Flou appliqué au rendu déjà composé ; on déborde un peu pour éviter les bords qui pâlissent. */
function blurStage(ctx: CanvasRenderingContext2D, amount: number, width: number, height: number) {
  const blurPx = amount * 0.035 * width;
  if (blurPx <= 0.3) return;
  const copy = createSurface(width, height);
  copy.ctx.drawImage(ctx.canvas, 0, 0);
  const bleed = blurPx * 2;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
  ctx.drawImage(copy.canvas, -bleed, -bleed, width + bleed * 2, height + bleed * 2);
  ctx.restore();
  release(copy);
}

/** Étapes 5 et 6 : réglages historiques (assombrissement, dégradé, grain) puis texte. */
function finish(ctx: CanvasRenderingContext2D, p: ResolvedEdit, width: number, height: number) {
  ctx.save();
  if (p.dim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${p.dim * 0.75})`;
    ctx.fillRect(0, 0, width, height);
  }

  const g = p.gradient;
  if (g.style !== 'none' && g.strength > 0) {
    let gradient: CanvasGradient;
    if (g.style === 'vignette') {
      gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.hypot(width, height) / 2);
    } else if (g.style === 'top') {
      gradient = ctx.createLinearGradient(0, 0, 0, height * 0.55);
    } else {
      gradient = ctx.createLinearGradient(0, height, 0, height * 0.45);
    }
    const strong = withAlpha(g.color, g.strength);
    const clear = withAlpha(g.color, 0);
    if (g.style === 'vignette') {
      gradient.addColorStop(0, clear);
      gradient.addColorStop(1, strong);
    } else {
      gradient.addColorStop(0, strong);
      gradient.addColorStop(1, clear);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawGrain(ctx, p.grain, width, height);

  const t = p.text;
  if (t.value.trim()) {
    const fontSize = textFontSize(t.size, width);
    ctx.font = `${t.bold ? 700 : 400} ${fontSize}px 'Google Sans Display', 'Google Sans', Roboto, system-ui, sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = fontSize * 0.25;
    const lines = t.value.split('\n').slice(0, 6);
    const lineHeight = fontSize * 1.2;
    const top = t.position * height - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, width / 2, top + i * lineHeight, width * 0.9));
  }
  ctx.restore();
}

export interface RenderOptions {
  /**
   * Largeur de travail visée pour le filtre et l'effet : l'aperçu les calcule en basse résolution,
   * puis agrandit le résultat par un multiple entier (les blocs restent nets). Une largeur d'affichage
   * proche de celle-ci est calculée telle quelle.
   */
  workWidth?: number;
  /** Brouillon : l'effet artistique est sauté (retour immédiat pendant un geste). */
  draft?: boolean;
}

/**
 * Le rendu, étape par étape : géométrie → ajustement → filtre → effet → réglages historiques → texte.
 * Écrit en générateur pour que l'effet (long) puisse être fractionné ; une seule définition sert
 * l'aperçu, l'export et les rendus synchrones, donc leurs résultats sont identiques.
 * Hors étapes sur pixels (filtre, effet), tout se dessine directement dans `ctx`. La source n'est lue
 * que pendant la première tranche : on peut la libérer dès que le rendu a commencé.
 */
function* pipeline(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  width: number,
  height: number,
  options: RenderOptions,
): Steps<void> {
  const p = resolveEdit(params);
  const filter = isFilterActive(p.filter) ? p.filter : null;
  const effect = !options.draft && isEffectActive(p.effect) ? p.effect : null;

  if (filter || effect) {
    const k = effect && options.workWidth ? Math.max(1, Math.round(width / options.workWidth)) : 1;
    const w = Math.ceil(width / k);
    const h = Math.ceil(height / k);
    const work = createSurface(w, h, true);
    drawBase(work.ctx, source, sourceSize, crop, p, w, h);
    const image = work.ctx.getImageData(0, 0, w, h);
    if (filter) applyFilter(image.data, w, h, filter);
    if (effect) {
      yield;
      const result = yield* runEffect({ data: image.data, width: w, height: h }, effect);
      if (result.data !== image.data) image.data.set(result.data);
    }
    work.ctx.putImageData(image, 0, 0);
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = k === 1 || UPSCALE_SMOOTH[effect?.kind ?? 'none'];
    ctx.drawImage(work.canvas, 0, 0, w, h, 0, 0, w * k, h * k);
    ctx.restore();
    release(work);
  } else {
    drawBase(ctx, source, sourceSize, crop, p, width, height);
  }

  blurStage(ctx, p.blur, width, height);
  finish(ctx, p, width, height);
}

/**
 * Dessine la photo avec toutes les retouches, à la taille demandée, d'une traite. Même fonction pour
 * l'aperçu (petit) et l'export (taille de l'écran) : le rendu est identique, seule la résolution change.
 * Un effet artistique, s'il y en a un, bloque jusqu'à la fin : `renderEditAsync` le fractionne.
 */
export function renderEdit(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  width: number,
  height: number,
  options: RenderOptions = {},
) {
  drain(pipeline(ctx, source, sourceSize, crop, params, width, height, options));
}

export interface AsyncRenderOptions extends RenderOptions {
  /** Annule le rendu en cours de route (le canevas n'est alors pas modifié si `atomic`). */
  signal?: AbortSignal;
  /** Compose dans un canevas à part, puis recopie d'un coup : l'image précédente reste affichée jusqu'à la fin. */
  atomic?: boolean;
}

/**
 * Même rendu que `renderEdit`, découpé en tranches qui laissent l'interface respirer.
 * Renvoie false si le rendu a été annulé.
 */
export async function renderEditAsync(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  width: number,
  height: number,
  { signal, atomic, ...options }: AsyncRenderOptions = {},
): Promise<boolean> {
  const buffer = atomic ? createSurface(width, height) : null;
  try {
    const done = await drainAsync(pipeline(buffer?.ctx ?? ctx, source, sourceSize, crop, params, width, height, options), signal);
    if (!done || signal?.aborted) return false;
    if (buffer) {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(buffer.canvas, 0, 0);
      ctx.restore();
    }
    return true;
  } finally {
    if (buffer) release(buffer);
  }
}

/** Rendu pleine taille encodé en JPEG (data URL) pour l'enregistrer côté natif ; sans geler l'interface. */
export async function exportEdit(
  source: CanvasImageSource,
  sourceSize: Size,
  crop: NormalizedRect | undefined,
  params: EditParams,
  output: Size,
  signal?: AbortSignal,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  const done = await renderEditAsync(ctx, source, sourceSize, crop, params, output.width, output.height, { signal });
  if (!done) throw new Error('Rendu annulé');
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  canvas.width = canvas.height = 0;
  return dataUrl;
}
