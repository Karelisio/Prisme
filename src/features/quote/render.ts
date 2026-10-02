import type { NativeQuote } from '@/shared/native/quote';
import {
  type Measure,
  type QuotePlan,
  type QuoteScreen,
  type QuoteStyle,
  type Tone,
  averageLuma,
  fontSpec,
  planQuote,
  sampleBox,
  samplePoints,
  shadowOf,
  toneFor,
  veilAlpha,
  veilBand,
} from './layout';

/** Fonds d'exemple de l'aperçu : de quoi voir le texte passer du clair au sombre selon la luminosité du fond. */
export type PreviewBackground = 'night' | 'dawn' | 'day';

/** Libellés en français (données) : `t(label)` à l'affichage. */
export const PREVIEW_BACKGROUNDS: readonly { value: PreviewBackground; label: string }[] = [
  { value: 'night', label: 'Nuit' },
  { value: 'dawn', label: 'Aube' },
  { value: 'day', label: 'Jour' },
];

const SKIES: Record<PreviewBackground, readonly [number, string][]> = {
  night: [
    [0, '#0b1026'],
    [0.55, '#25205a'],
    [1, '#4a2d6b'],
  ],
  dawn: [
    [0, '#6a5acd'],
    [0.45, '#e58a6e'],
    [1, '#f6c177'],
  ],
  day: [
    [0, '#7cc0f2'],
    [0.6, '#cfe8fb'],
    [1, '#f4f9ff'],
  ],
};

/** Suite pseudo-aléatoire fixe : l'aperçu ne change pas d'un tracé à l'autre. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number, kind: PreviewBackground) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  for (const [stop, color] of SKIES[kind]) sky.addColorStop(stop, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const next = lcg(7);
  if (kind === 'night') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 70; i++) {
      const r = 0.6 + next() * 1.4;
      ctx.beginPath();
      ctx.arc(next() * width, next() * height * 0.8, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = kind === 'day' ? 'rgba(255,255,255,0.7)' : 'rgba(255,214,170,0.35)';
    for (let i = 0; i < 6; i++) {
      const w = width * (0.25 + next() * 0.3);
      ctx.beginPath();
      ctx.ellipse(next() * width, height * (0.2 + next() * 0.6), w, w * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Collines au premier plan : un peu de relief sous le texte.
  ctx.fillStyle = kind === 'day' ? 'rgba(120,170,120,0.55)' : 'rgba(10,10,30,0.45)';
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, height * 0.86);
  ctx.quadraticCurveTo(width * 0.3, height * 0.78, width * 0.6, height * 0.88);
  ctx.quadraticCurveTo(width * 0.85, height * 0.94, width, height * 0.84);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

/** Luminosité moyenne de la zone du texte, mesurée aux mêmes points que le natif. */
function localLuma(ctx: CanvasRenderingContext2D, plan: QuotePlan, width: number, height: number): number {
  const box = sampleBox(plan, width, height);
  const points = samplePoints(box);
  if (points.length === 0) return 0;
  const image = ctx.getImageData(box.left, box.top, box.right - box.left, box.bottom - box.top);
  const rgba: number[] = [];
  for (const { x, y } of points) {
    const at = ((y - box.top) * image.width + (x - box.left)) * 4;
    rgba.push(image.data[at] as number, image.data[at + 1] as number, image.data[at + 2] as number, 255);
  }
  return averageLuma(rgba);
}

function drawVeil(ctx: CanvasRenderingContext2D, plan: QuotePlan, tone: Tone, luma: number, width: number, height: number) {
  const band = veilBand(plan, height);
  const rgb = tone === 'light' ? '0,0,0' : '255,255,255';
  const alpha = veilAlpha(tone, luma);
  const gradient = ctx.createLinearGradient(0, band.top, 0, band.bottom);
  gradient.addColorStop(0, `rgba(${rgb},0)`);
  gradient.addColorStop(0.3, `rgba(${rgb},${alpha})`);
  gradient.addColorStop(0.7, `rgba(${rgb},${alpha})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, band.top, width, band.bottom - band.top);
}

function drawText(ctx: CanvasRenderingContext2D, plan: QuotePlan, tone: Tone, style: QuoteStyle) {
  const shadow = shadowOf(tone, plan.fontSize);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tone === 'light' ? '#ffffff' : '#000000';
  ctx.shadowColor = tone === 'light' ? `rgba(0,0,0,${shadow.alpha})` : `rgba(255,255,255,${shadow.alpha})`;
  ctx.shadowBlur = shadow.blur;
  ctx.shadowOffsetY = shadow.dy;
  ctx.font = fontSpec(style.font, 'text', plan.fontSize);
  plan.lines.forEach((line, i) => ctx.fillText(line, plan.centerX, plan.baselines[i] as number));
  if (plan.author) {
    ctx.globalAlpha = 0.85;
    ctx.font = fontSpec(style.font, 'author', plan.authorSize);
    ctx.fillText(plan.author, plan.centerX, plan.authorBaseline);
  }
  ctx.restore();
}

export interface PreviewOptions {
  quote: NativeQuote;
  style: QuoteStyle;
  screen: QuoteScreen;
  background: PreviewBackground;
  width: number;
  height: number;
}

/**
 * Dessine l'aperçu : le même plan que le natif (retours à la ligne, taille, position), la même couleur
 * automatique d'après la luminosité du fond, puis voile, ombre et texte. Renvoie le plan, pour les tests.
 */
export function drawQuotePreview(canvas: HTMLCanvasElement, options: PreviewOptions): QuotePlan | null {
  const { quote, style, screen, background, width, height } = options;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  paintBackground(ctx, width, height, background);
  const measure: Measure = (text, size, role) => {
    ctx.font = fontSpec(style.font, role, size);
    return ctx.measureText(text).width;
  };
  const plan = planQuote(quote, style, screen, width, height, measure);
  const luma = localLuma(ctx, plan, width, height);
  const tone = toneFor(style.color, luma);
  drawVeil(ctx, plan, tone, luma, width, height);
  drawText(ctx, plan, tone, style);
  return plan;
}
