import { drawGrain } from '@/shared/lib/noise';
import type { ColorScheme } from '@/shared/theme/scheme';

export type GeneratorStyle = 'solid' | 'linear' | 'radial' | 'aurora' | 'waves' | 'shapes';

export interface GeneratorParams {
  style: GeneratorStyle;
  colors: [string, string, string];
  /** Angle du dégradé linéaire, en degrés. */
  angle: number;
  grain: number;
  /** Graine : même graine = même composition (aperçu et export identiques). */
  seed: number;
}

export const STYLES: readonly { value: GeneratorStyle; label: string }[] = [
  { value: 'solid', label: 'Uni' },
  { value: 'linear', label: 'Dégradé' },
  { value: 'radial', label: 'Radial' },
  { value: 'aurora', label: 'Aurore' },
  { value: 'waves', label: 'Vagues' },
  { value: 'shapes', label: 'Formes' },
];

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

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  }
  ctx.restore();
  drawGrain(ctx, p.grain, width, height);
}

export async function exportGenerated(p: GeneratorParams, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  renderGenerated(ctx, p, width, height);
  // PNG pour les aplats (pas d'artefacts), JPEG dès qu'il y a du grain ou des dégradés riches.
  const data = p.style === 'solid' && p.grain === 0 ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95);
  canvas.width = canvas.height = 0;
  return data;
}

export function randomize(seed: number): Pick<GeneratorParams, 'colors' | 'seed' | 'angle'> {
  const random = mulberry32(seed);
  return {
    seed: Math.floor(random() * 1_000_000),
    colors: CURATED_PALETTES[Math.floor(random() * CURATED_PALETTES.length)]!,
    angle: Math.round(random() * 360),
  };
}
