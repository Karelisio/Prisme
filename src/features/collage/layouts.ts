/**
 * Dispositions du collage et géométrie des cases. Fonctions pures : l'aperçu (petit canevas) et
 * l'export (taille de l'écran) appellent les mêmes, seules les dimensions changent.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type GridId = 'stack2' | 'side2' | 'big2small' | 'bands3' | 'grid4' | 'big3small';
type PolaroidId = 'polaroid2' | 'polaroid3' | 'polaroid4';
export type LayoutId = GridId | PolaroidId;
export type PhotoCount = 2 | 3 | 4;

export const MAX_PHOTOS = 4;

export interface LayoutInfo {
  id: LayoutId;
  count: PhotoCount;
  /** Libellé court, sous la vignette. */
  label: string;
  /** Intitulé complet (lecteur d'écran, infobulle). */
  description: string;
}

/** Dans l'ordre d'affichage des vignettes : 2 photos, puis 3, puis 4. */
export const LAYOUTS: readonly LayoutInfo[] = [
  { id: 'stack2', count: 2, label: 'Haut / bas', description: 'Deux photos, l’une au-dessus de l’autre' },
  { id: 'side2', count: 2, label: 'Côte à côte', description: 'Deux photos côte à côte' },
  { id: 'polaroid2', count: 2, label: 'Polaroïds', description: 'Deux polaroïds éparpillés' },
  { id: 'big2small', count: 3, label: '1 + 2', description: 'Trois photos, une grande et deux petites' },
  { id: 'bands3', count: 3, label: 'Bandes', description: 'Trois photos en bandes' },
  { id: 'polaroid3', count: 3, label: 'Polaroïds', description: 'Trois polaroïds éparpillés' },
  { id: 'grid4', count: 4, label: 'Grille', description: 'Quatre photos en grille 2×2' },
  { id: 'big3small', count: 4, label: '1 + 3', description: 'Quatre photos, une grande et trois petites' },
  { id: 'polaroid4', count: 4, label: 'Polaroïds', description: 'Quatre polaroïds éparpillés' },
];

const BY_ID = Object.fromEntries(LAYOUTS.map((l) => [l.id, l])) as Record<LayoutId, LayoutInfo>;

export const layoutInfo = (id: LayoutId): LayoutInfo => BY_ID[id];

/** Disposition proposée d'emblée pour un nombre de photos déjà choisies. */
export function defaultLayout(photos: number): LayoutId {
  if (photos <= 2 && photos > 0) return 'stack2';
  if (photos >= 4) return 'grid4';
  return 'big2small';
}

/** Marges autour de la photo dans sa carte (cadre des polaroïds). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Une case du collage : une carte (rectangle éventuellement tourné autour de son centre) qui
 * contient la fenêtre où la photo est cadrée.
 */
export interface Cell {
  /** Centre de la carte, en pixels du canevas. */
  cx: number;
  cy: number;
  /** Taille de la carte, cadre compris. */
  width: number;
  height: number;
  /** Rotation autour du centre, en radians, dans le sens horaire (comme CSS). */
  rotation: number;
  inset: Insets;
  /** Rayon des coins de la carte. */
  radius: number;
  /** Rayon des coins de la fenêtre photo. */
  photoRadius: number;
  /** Carte à cadre blanc et ombre portée (polaroïd). */
  framed: boolean;
}

/** Fenêtre photo d'une case, dans le repère centré sur la case (avant rotation). */
export function photoWindow(cell: Cell): Rect {
  const { inset } = cell;
  return {
    x: -cell.width / 2 + inset.left,
    y: -cell.height / 2 + inset.top,
    width: Math.max(0, cell.width - inset.left - inset.right),
    height: Math.max(0, cell.height - inset.top - inset.bottom),
  };
}

export interface LayoutOptions {
  /** Espacement : marge extérieure et écart entre les cases, en pixels du canevas. */
  gap: number;
  /** Rayon des coins, en pixels du canevas. */
  radius: number;
}

/** Au-delà, les cases disparaîtraient : l'espacement ne dépasse jamais cette part du petit côté. */
const MAX_GAP_SHARE = 0.1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// --- Dispositions en cases jointives : arbre de découpes -------------------------------------

type Axis = 'column' | 'row';

interface Slice {
  weight: number;
  split?: Split;
}

interface Split {
  /** `column` : les parts s'empilent de haut en bas ; `row` : de gauche à droite. */
  axis: Axis;
  slices: Slice[];
}

const leaf = (weight = 1): Slice => ({ weight });
const group = (weight: number, axis: Axis, ...slices: Slice[]): Slice => ({ weight, split: { axis, slices } });

const GRIDS: Record<GridId, Split> = {
  stack2: { axis: 'column', slices: [leaf(), leaf()] },
  side2: { axis: 'row', slices: [leaf(), leaf()] },
  // Grande photo en haut (60 %), deux petites dessous.
  big2small: { axis: 'column', slices: [leaf(3), group(2, 'row', leaf(), leaf())] },
  bands3: { axis: 'column', slices: [leaf(), leaf(), leaf()] },
  grid4: { axis: 'column', slices: [group(1, 'row', leaf(), leaf()), group(1, 'row', leaf(), leaf())] },
  // Grande photo en haut (deux tiers), trois petites dessous : sur un écran haut, elles restent assez larges.
  big3small: { axis: 'column', slices: [leaf(2), group(1, 'row', leaf(), leaf(), leaf())] },
};

function place(rect: Rect, split: Split, gap: number, out: Rect[]) {
  const total = split.slices.reduce((sum, s) => sum + s.weight, 0);
  const vertical = split.axis === 'column';
  const space = Math.max(0, (vertical ? rect.height : rect.width) - gap * (split.slices.length - 1));
  let offset = 0;
  for (const slice of split.slices) {
    const size = (space * slice.weight) / total;
    const part: Rect = vertical
      ? { x: rect.x, y: rect.y + offset, width: rect.width, height: size }
      : { x: rect.x + offset, y: rect.y, width: size, height: rect.height };
    offset += size + gap;
    if (slice.split) place(part, slice.split, gap, out);
    else out.push(part);
  }
}

// --- Polaroïds éparpillés ----------------------------------------------------------------------

interface PolaroidSpec {
  /** Centre de la carte, en part de la largeur et de la hauteur du canevas. */
  x: number;
  y: number;
  /** Largeur de la carte, en part de la largeur d'un écran aux proportions de référence. */
  width: number;
  /** Rotation, en degrés. */
  rotation: number;
}

/** Carte au format polaroïd : fenêtre photo carrée, marge plus large en bas. */
const POLAROID = { height: 1.2, side: 0.07, top: 0.07 } as const;

/** Proportions (hauteur / largeur) pour lesquelles les positions sont dessinées ; un écran plus court réduit les cartes. */
const DESIGN_RATIO = 2.2;

const POLAROIDS: Record<PolaroidId, readonly PolaroidSpec[]> = {
  polaroid2: [
    { x: 0.46, y: 0.29, width: 0.64, rotation: -5 },
    { x: 0.54, y: 0.69, width: 0.64, rotation: 4 },
  ],
  polaroid3: [
    { x: 0.4, y: 0.21, width: 0.56, rotation: -6 },
    { x: 0.6, y: 0.5, width: 0.56, rotation: 5 },
    { x: 0.42, y: 0.79, width: 0.56, rotation: -3 },
  ],
  polaroid4: [
    { x: 0.32, y: 0.17, width: 0.5, rotation: -7 },
    { x: 0.68, y: 0.38, width: 0.5, rotation: 6 },
    { x: 0.32, y: 0.62, width: 0.5, rotation: -4 },
    { x: 0.68, y: 0.83, width: 0.5, rotation: 5 },
  ],
};

const isPolaroid = (id: LayoutId): id is PolaroidId => id in POLAROIDS;

function polaroidCells(specs: readonly PolaroidSpec[], width: number, height: number, gap: number, radius: number): Cell[] {
  // Ici l'espacement éloigne les cartes en les réduisant (elles se chevauchent à espacement nul).
  const shrink = Math.max(0.8, 1 - (1.5 * gap) / width);
  const base = Math.min(width, height / DESIGN_RATIO);
  return specs.map((spec) => {
    const cardWidth = spec.width * base * shrink;
    const cardHeight = cardWidth * POLAROID.height;
    const side = cardWidth * POLAROID.side;
    const top = cardWidth * POLAROID.top;
    const windowSide = cardWidth - 2 * side;
    return {
      cx: spec.x * width,
      cy: spec.y * height,
      width: cardWidth,
      height: cardHeight,
      rotation: (spec.rotation * Math.PI) / 180,
      inset: { top, right: side, bottom: cardHeight - top - windowSide, left: side },
      radius: Math.min(radius * 0.4, cardWidth * 0.08),
      photoRadius: 0,
      framed: true,
    };
  });
}

/**
 * Cases d'une disposition pour un canevas de `width` × `height` pixels, dans l'ordre de remplissage
 * (de haut en bas, de gauche à droite ; les polaroïds se superposent dans cet ordre).
 */
export function layoutCells(id: LayoutId, width: number, height: number, options: LayoutOptions): Cell[] {
  const gap = clamp(Number.isFinite(options.gap) ? options.gap : 0, 0, Math.min(width, height) * MAX_GAP_SHARE);
  const radius = Math.max(0, Number.isFinite(options.radius) ? options.radius : 0);
  if (isPolaroid(id)) return polaroidCells(POLAROIDS[id], width, height, gap, radius);

  const rects: Rect[] = [];
  place({ x: gap, y: gap, width: Math.max(0, width - 2 * gap), height: Math.max(0, height - 2 * gap) }, GRIDS[id], gap, rects);
  return rects.map((r) => {
    const corner = Math.min(radius, r.width / 2, r.height / 2);
    return {
      cx: r.x + r.width / 2,
      cy: r.y + r.height / 2,
      width: r.width,
      height: r.height,
      rotation: 0,
      inset: NO_INSETS,
      radius: corner,
      photoRadius: corner,
      framed: false,
    };
  });
}
