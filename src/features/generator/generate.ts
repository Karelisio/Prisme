import { t } from '@/shared/i18n';
import { drawGrain } from '@/shared/lib/noise';
import type { ColorScheme } from '@/shared/theme/scheme';
import { type Palette6, completePalette } from './color';
import { clampPointCount, drawMesh } from './mesh';
import { type GeometricShape, PATTERN_KINDS, type PatternKind, buildPattern, drawScene } from './patterns';
import { mulberry32 } from './random';

export { mulberry32 };
export type { GeometricShape, PatternKind };

export type GeneratorStyle = 'solid' | 'linear' | 'radial' | 'aurora' | 'waves' | 'shapes' | 'mesh' | PatternKind;

export interface GeneratorParams {
  style: GeneratorStyle;
  /**
   * Trois couleurs de base. Par convention : fond, accent doux, contraste. Les motifs et le dégradé
   * organique en tirent trois teintes d'appoint (mélanges) si `accents` n'est pas fourni.
   */
  colors: [string, string, string];
  /** Angle du dégradé linéaire, en degrés. */
  angle: number;
  grain: number;
  /** Graine : même graine = même composition (aperçu et export identiques). */
  seed: number;
  /** Teintes d'appoint de la palette (ex. rôles d'accent Material You) ; absentes, elles sont dérivées de `colors`. */
  accents?: readonly [string, string, string];
  /** Échelle du motif, de 0 (grands motifs) à 1 (motifs fins). */
  scale?: number;
  /** Épaisseur des traits, écart entre tuiles, taille des pois ou densité, de 0 à 1 selon le motif. */
  thickness?: number;
  /** Rotation du motif, en degrés. */
  rotation?: number;
  /** Forme des tuiles du motif géométrique. */
  shape?: GeometricShape;
  /** Douceur du dégradé organique : 0 = zones marquées, 1 = fondu très doux. */
  softness?: number;
  /** Nombre de points de couleur du dégradé organique (4 à 6). */
  points?: number;
}

/** Réglages propres aux styles (hors couleurs, graine et grain). */
export interface StyleSettings {
  scale: number;
  thickness: number;
  rotation: number;
  shape: GeometricShape;
  softness: number;
  points: number;
}

export type StyleGroup = 'gradients' | 'patterns';

/** Libellés (familles, styles, réglages) en français dans les données : `t(label)` à l'affichage. */
export const STYLE_GROUPS: readonly { value: StyleGroup; label: string }[] = [
  { value: 'gradients', label: 'Dégradés' },
  { value: 'patterns', label: 'Motifs' },
];

export const STYLES: readonly { value: GeneratorStyle; label: string; group: StyleGroup }[] = [
  { value: 'solid', label: 'Uni', group: 'gradients' },
  { value: 'linear', label: 'Dégradé', group: 'gradients' },
  { value: 'radial', label: 'Radial', group: 'gradients' },
  { value: 'aurora', label: 'Aurore', group: 'gradients' },
  { value: 'mesh', label: 'Organique', group: 'gradients' },
  { value: 'geometric', label: 'Géométrique', group: 'patterns' },
  { value: 'dots', label: 'Pois', group: 'patterns' },
  { value: 'wavy', label: 'Vagues', group: 'patterns' },
  { value: 'bauhaus', label: 'Bauhaus', group: 'patterns' },
  { value: 'stripes', label: 'Rayures', group: 'patterns' },
  { value: 'terrazzo', label: 'Terrazzo', group: 'patterns' },
  { value: 'isometric', label: 'Grille isométrique', group: 'patterns' },
  { value: 'shapes', label: 'Formes', group: 'patterns' },
  { value: 'waves', label: 'Dunes', group: 'patterns' },
];

export type ControlKey = keyof StyleSettings | 'angle';

export interface ControlSpec {
  key: ControlKey;
  label: string;
}

const SCALE: ControlSpec = { key: 'scale', label: 'Échelle' };
const ROTATION: ControlSpec = { key: 'rotation', label: 'Rotation' };

/** Réglages pertinents pour chaque style, dans l'ordre d'affichage (le grain, commun, est à part). */
export const STYLE_CONTROLS: Record<GeneratorStyle, readonly ControlSpec[]> = {
  solid: [],
  linear: [{ key: 'angle', label: 'Angle' }],
  radial: [],
  aurora: [],
  waves: [],
  shapes: [],
  mesh: [
    { key: 'softness', label: 'Douceur' },
    { key: 'points', label: 'Points' },
  ],
  geometric: [{ key: 'shape', label: 'Forme' }, SCALE, { key: 'thickness', label: 'Écart' }, ROTATION],
  dots: [SCALE, { key: 'thickness', label: 'Taille' }, ROTATION],
  wavy: [SCALE, { key: 'thickness', label: 'Épaisseur' }, ROTATION],
  bauhaus: [SCALE, { key: 'thickness', label: 'Épaisseur' }],
  stripes: [SCALE, { key: 'thickness', label: 'Épaisseur' }, ROTATION],
  terrazzo: [SCALE, { key: 'thickness', label: 'Densité' }],
  isometric: [SCALE, { key: 'thickness', label: 'Épaisseur' }, ROTATION],
};

/** Bornes des réglages en curseur (échelle, épaisseur, douceur : 0 à 1). */
export const CONTROL_RANGES = {
  angle: { min: 0, max: 360, step: 5, unit: '°' },
  rotation: { min: -90, max: 90, step: 1, unit: '°' },
  unit: { min: 0, max: 1, step: 0.01, unit: '' },
} as const;

const BASE_SETTINGS: StyleSettings = { scale: 0.5, thickness: 0.4, rotation: 0, shape: 'triangles', softness: 0.5, points: 5 };

/** Valeurs de départ de chaque style : elles donnent un premier résultat équilibré. */
const STYLE_DEFAULTS: Partial<Record<GeneratorStyle, Partial<StyleSettings>>> = {
  mesh: { softness: 0.5, points: 5 },
  geometric: { scale: 0.5, thickness: 0.2, rotation: 0, shape: 'triangles' },
  dots: { scale: 0.5, thickness: 0.5, rotation: 0 },
  wavy: { scale: 0.5, thickness: 0.4, rotation: -12 },
  bauhaus: { scale: 0.5, thickness: 0.5 },
  stripes: { scale: 0.5, thickness: 0.5, rotation: 0 },
  terrazzo: { scale: 0.5, thickness: 0.5 },
  isometric: { scale: 0.5, thickness: 0.25, rotation: 0 },
};

export function styleSettings(style: GeneratorStyle): StyleSettings {
  return { ...BASE_SETTINGS, ...STYLE_DEFAULTS[style] };
}

/** Réglages effectifs d'une création : valeurs fournies, sinon celles du style. */
export function resolveSettings(p: GeneratorParams): StyleSettings {
  const defaults = styleSettings(p.style);
  return {
    scale: p.scale ?? defaults.scale,
    thickness: p.thickness ?? defaults.thickness,
    rotation: p.rotation ?? defaults.rotation,
    shape: p.shape ?? defaults.shape,
    softness: p.softness ?? defaults.softness,
    points: clampPointCount(p.points ?? defaults.points),
  };
}

/** Change de style en repartant des réglages de départ de ce style ; couleurs, graine et grain restent. */
export function applyStyle(p: GeneratorParams, style: GeneratorStyle): GeneratorParams {
  return { ...p, style, ...styleSettings(style) };
}

export function isPatternStyle(style: GeneratorStyle): style is PatternKind {
  return (PATTERN_KINDS as readonly string[]).includes(style);
}

/** Palettes proposées ; la première vient des couleurs Material You actuelles. */
export const CURATED_PALETTES: readonly [string, string, string][] = [
  ['#0f2027', '#2c5364', '#a8c0ff'],
  ['#ff9a8b', '#ff6a88', '#2b1a3f'],
  ['#f6d365', '#fda085', '#4a2c2a'],
  ['#a1c4fd', '#c2e9fb', '#1c2541'],
  ['#d4fc79', '#96e6a1', '#11372a'],
  ['#e0c3fc', '#8ec5fc', '#1d1a39'],
  ['#232526', '#414345', '#e6e6e6'],
  ['#f5efe6', '#e8dfca', '#6d5d4b'],
];

export const DEFAULT_GENERATOR: GeneratorParams = {
  style: 'aurora',
  colors: CURATED_PALETTES[5]!,
  angle: 160,
  grain: 0.2,
  seed: 7,
};

export function schemePalette(scheme: ColorScheme): [string, string, string] {
  return [scheme.primaryContainer, scheme.tertiaryContainer, scheme.inverseSurface];
}

/** Teintes d'appoint tirées des rôles d'accent du schéma (pour les motifs et le dégradé organique). */
export function schemeAccents(scheme: ColorScheme): [string, string, string] {
  return [scheme.primary, scheme.secondary, scheme.tertiary];
}

/** Les six couleurs dont disposent les motifs et le dégradé organique. */
export function paletteOf(p: Pick<GeneratorParams, 'colors' | 'accents'>): Palette6 {
  return completePalette(p.colors, p.accents);
}

/** Extrémités d'un dégradé linéaire couvrant tout le rectangle pour un angle donné (0° = vers le haut). */
export function gradientLine(angle: number, width: number, height: number): [number, number, number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half];
}

/** Dessine une création minimaliste ; identique quelle que soit la taille de rendu. */
export function renderGenerated(ctx: CanvasRenderingContext2D, p: GeneratorParams, width: number, height: number) {
  const [c1, c2, c3] = p.colors;
  const random = mulberry32(p.seed);
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  switch (p.style) {
    case 'solid':
      ctx.fillStyle = c1;
      ctx.fillRect(0, 0, width, height);
      break;
    case 'linear': {
      const g = ctx.createLinearGradient(...gradientLine(p.angle, width, height));
      g.addColorStop(0, c1);
      g.addColorStop(0.55, c2);
      g.addColorStop(1, c3);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'radial': {
      const g = ctx.createRadialGradient(width / 2, height * 0.38, 0, width / 2, height * 0.38, Math.hypot(width, height) * 0.6);
      g.addColorStop(0, c1);
      g.addColorStop(0.5, c2);
      g.addColorStop(1, c3);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      break;
    }
    case 'aurora': {
      ctx.fillStyle = c3;
      ctx.fillRect(0, 0, width, height);
      // Grandes taches colorées, très floutées : effet « aurore » doux.
      ctx.filter = `blur(${Math.round(width * 0.14)}px)`;
      const blobs = [c1, c2, c1, c2];
      blobs.forEach((color, i) => {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(
          width * (0.15 + random() * 0.7),
          height * (0.12 + (i / blobs.length) * 0.7 + random() * 0.12),
          width * (0.35 + random() * 0.25),
          height * (0.12 + random() * 0.1),
          random() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      });
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      break;
    }
    case 'waves': {
      ctx.fillStyle = c3;
      ctx.fillRect(0, 0, width, height);
      const layers = [c1, c2, c1];
      layers.forEach((color, i) => {
        const base = height * (0.55 + i * 0.13);
        const amplitude = height * (0.03 + random() * 0.03);
        const frequency = 1 + random() * 1.5;
        const phase = random() * Math.PI * 2;
        ctx.globalAlpha = 0.55 + i * 0.15;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += Math.max(2, width / 120)) {
          ctx.lineTo(x, base + Math.sin((x / width) * Math.PI * 2 * frequency + phase) * amplitude);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      break;
    }
    case 'shapes': {
      ctx.fillStyle = c1;
      ctx.fillRect(0, 0, width, height);
      // Composition géométrique sobre : un disque, un arc, un petit cercle.
      ctx.fillStyle = c2;
      ctx.beginPath();
      ctx.arc(width * (0.25 + random() * 0.5), height * (0.25 + random() * 0.2), width * (0.28 + random() * 0.12), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = c3;
      ctx.lineWidth = width * 0.035;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(width / 2, height * (0.72 + random() * 0.08), width * (0.3 + random() * 0.1), Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c3;
      ctx.beginPath();
      ctx.arc(width * (0.15 + random() * 0.7), height * (0.88 + random() * 0.05), width * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mesh': {
      const s = resolveSettings(p);
      drawMesh(ctx, paletteOf(p), { seed: p.seed, softness: s.softness, points: s.points }, width, height);
      break;
    }
    default: {
      const s = resolveSettings(p);
      const scene = buildPattern(p.style, paletteOf(p), { scale: s.scale, thickness: s.thickness, rotation: s.rotation, shape: s.shape, seed: p.seed }, width, height);
      drawScene(ctx, scene, width, height);
    }
  }
  ctx.restore();
  drawGrain(ctx, p.grain, width, height);
}

export async function exportGenerated(p: GeneratorParams, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('Canvas indisponible'));
  renderGenerated(ctx, p, width, height);
  // PNG pour les aplats et les motifs nets (pas d'artefacts), JPEG dès qu'il y a du grain ou des dégradés riches.
  const flat = p.style === 'solid' || isPatternStyle(p.style);
  const data = flat && p.grain === 0 ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
  canvas.width = canvas.height = 0;
  return data;
}

/** Graine suivante (bouton « Varier ») : une autre composition, toujours reproductible. */
export function nextSeed(seed: number): number {
  return Math.floor(mulberry32(seed + 1)() * 1_000_000);
}

export function randomize(seed: number): Pick<GeneratorParams, 'colors' | 'seed' | 'angle' | 'accents'> {
  const random = mulberry32(seed);
  return {
    seed: Math.floor(random() * 1_000_000),
    colors: CURATED_PALETTES[Math.floor(random() * CURATED_PALETTES.length)]!,
    angle: Math.round(random() * 360),
    // Une palette tirée au hasard n'a pas de teintes d'appoint propres : elles sont dérivées des trois couleurs.
    accents: undefined,
  };
}
