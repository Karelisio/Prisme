/**
 * Mise en page de la phrase sur le fond d'écran : retours à la ligne, taille, position, couleur et voile.
 * Calculs purs (la mesure du texte est fournie par l'appelant) : le natif (QuoteLayout.kt, QuoteColors.kt)
 * refait les mêmes, avec les mêmes constantes, et l'aperçu de l'app dessine ce que le natif dessinera.
 * Toute modification doit être reportée là-bas : les mêmes valeurs d'essai sont vérifiées des deux côtés.
 */

export type QuoteFont = 'serif' | 'sans';
export type QuotePosition = 'top' | 'center' | 'bottom';
export type QuoteSize = 'small' | 'medium' | 'large';
export type QuoteColor = 'auto' | 'white' | 'black';
export type QuoteScreen = 'home' | 'lock';

export interface QuoteStyle {
  font: QuoteFont;
  position: QuotePosition;
  size: QuoteSize;
  color: QuoteColor;
}

/** Corps du texte, en fraction de la largeur de l'écran. */
export const SIZE_FACTOR: Record<QuoteSize, number> = { small: 0.05, medium: 0.062, large: 0.076 };
/** Largeur maximale des lignes, en fraction de la largeur de l'écran. */
export const MAX_WIDTH = 0.8;
/** Hauteur maximale du bloc (texte et auteur), en fraction de la hauteur de l'écran. */
export const MAX_BLOCK = 0.34;
/** Le texte rétrécit (de 8 % à chaque pas) jusqu'à cette part de sa taille d'origine, puis il est coupé. */
export const MIN_SCALE = 0.62;
export const SHRINK = 0.92;
export const LINE_HEIGHT = 1.3;
export const MAX_LINES = 12;
/** Taille de l'auteur et espace qui le sépare du texte, en fraction du corps du texte. */
export const AUTHOR_SCALE = 0.6;
export const AUTHOR_GAP = 0.5;
/** Marge haute et basse à ne jamais dépasser, en fraction de la hauteur de l'écran. */
export const EDGE_MARGIN = 0.06;

/**
 * Repères verticaux (fraction de la hauteur) : haut du bloc pour « haut », milieu pour « centre », bas du bloc
 * pour « bas ». Au verrouillage, « haut » commence sous l'horloge ; l'accueil a sa barre d'état et son dock.
 */
export const ZONES: Record<QuoteScreen, Record<QuotePosition, number>> = {
  lock: { top: 0.34, center: 0.5, bottom: 0.8 },
  home: { top: 0.1, center: 0.5, bottom: 0.8 },
};

/** Au-dessus de cette luminosité (0 à 1) locale, le texte automatique devient sombre. */
export const LIGHT_LUMA_THRESHOLD = 0.58;

export type Tone = 'light' | 'dark';

/** Espaces d'un texte saisi : les mêmes que ceux que reconnaît le natif. */
const SPACES = /[ \t\n\r\f\v\xA0\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}]+/gu;

/** Espace insécable. */
const NBSP = '\xA0';

/**
 * Typographie française : espaces simplifiées, apostrophes courbes, points de suspension, espace insécable
 * avant « : ; ! ? » et autour des guillemets, pour qu'une ligne ne commence jamais par une ponctuation.
 */
export function typeset(text: string): string {
  return text
    .replace(SPACES, ' ')
    .replace(/^ | $/g, '')
    .replace(/'/g, '’')
    .replace(/\.\.\./g, '…')
    .replace(/ ([:;!?»])/gu, `${NBSP}$1`)
    .replace(/« /gu, `«${NBSP}`);
}

export type MeasureText = (text: string) => number;

/** Retour à la ligne au mot près ; un mot plus large que la ligne est coupé au caractère près. */
export function wrapLines(text: string, maxWidth: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (word === '') continue;
    if (line !== '') {
      const joined = `${line} ${word}`;
      if (measure(joined) <= maxWidth) {
        line = joined;
        continue;
      }
      lines.push(line);
      line = '';
    }
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const char of Array.from(word)) {
      if (chunk !== '' && measure(chunk + char) > maxWidth) {
        lines.push(chunk);
        chunk = '';
      }
      chunk += char;
    }
    line = chunk;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * Comme [wrapLines], mais sur la largeur la plus étroite qui garde le même nombre de lignes : des lignes
 * de longueurs voisines, sans mot isolé sur la dernière.
 */
export function balancedLines(text: string, maxWidth: number, measure: MeasureText): string[] {
  const greedy = wrapLines(text, maxWidth, measure);
  if (greedy.length < 2) return greedy;
  let low = 0;
  let high = maxWidth;
  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;
    if (wrapLines(text, middle, measure).length === greedy.length) high = middle;
    else low = middle;
  }
  return wrapLines(text, high, measure);
}

/** Raccourcit [line] pour qu'elle tienne avec « … » ; `force` ajoute les points de suspension même si elle tient. */
export function ellipsize(line: string, maxWidth: number, measure: MeasureText, force: boolean): string {
  if (!force && measure(line) <= maxWidth) return line;
  let kept = line;
  while (kept !== '' && measure(`${kept}…`) > maxWidth) kept = kept.slice(0, -1).trimEnd();
  return `${kept}…`;
}

/** Mesure d'un texte à une taille donnée : `role` distingue le texte de la ligne de l'auteur (autre police). */
export type Measure = (text: string, size: number, role: 'text' | 'author') => number;

export interface QuotePlan {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** Ligne de l'auteur (« — Nom »), null s'il n'y en a pas. */
  author: string | null;
  authorSize: number;
  /** Abscisse du centre des lignes. */
  centerX: number;
  maxWidth: number;
  top: number;
  height: number;
  /** Ligne de base de chaque ligne de texte, puis celle de l'auteur. */
  baselines: number[];
  authorBaseline: number;
  /** Le texte a été coupé : même rétréci, il ne tenait pas dans le bloc. */
  truncated: boolean;
}

function blockHeight(lineCount: number, size: number, hasAuthor: boolean): number {
  const authorSize = size * AUTHOR_SCALE;
  return lineCount * size * LINE_HEIGHT + (hasAuthor ? size * AUTHOR_GAP + authorSize * LINE_HEIGHT : 0);
}

/** Place la phrase sur un écran de [width] × [height] pixels. */
export function planQuote(
  input: { text: string; author?: string | null },
  style: QuoteStyle,
  screen: QuoteScreen,
  width: number,
  height: number,
  measure: Measure,
): QuotePlan {
  const text = typeset(input.text);
  const authorName = typeset(input.author ?? '');
  const hasAuthor = authorName !== '';
  const maxWidth = width * MAX_WIDTH;
  const base = width * SIZE_FACTOR[style.size];
  const maxBlock = height * MAX_BLOCK;

  let size = base;
  let lines: string[];
  for (;;) {
    const current = size;
    lines = balancedLines(text, maxWidth, (s) => measure(s, current, 'text'));
    if ((lines.length <= MAX_LINES && blockHeight(lines.length, size, hasAuthor) <= maxBlock) || size <= base * MIN_SCALE) break;
    size = Math.max(base * MIN_SCALE, size * SHRINK);
  }

  const lineHeight = size * LINE_HEIGHT;
  const authorSize = size * AUTHOR_SCALE;
  const room = Math.floor((maxBlock - blockHeight(0, size, hasAuthor)) / lineHeight);
  const allowed = Math.max(1, Math.min(MAX_LINES, room));
  let truncated = false;
  if (lines.length > allowed) {
    truncated = true;
    lines = lines.slice(0, allowed);
    const last = lines.length - 1;
    lines[last] = ellipsize(lines[last] as string, maxWidth, (s) => measure(s, size, 'text'), true);
  }
  const author = hasAuthor ? ellipsize(`— ${authorName}`, maxWidth, (s) => measure(s, authorSize, 'author'), false) : null;

  const blockH = blockHeight(lines.length, size, hasAuthor);
  const anchor = ZONES[screen][style.position] * height;
  const wanted = style.position === 'top' ? anchor : style.position === 'center' ? anchor - blockH / 2 : anchor - blockH;
  const margin = height * EDGE_MARGIN;
  const top = Math.min(Math.max(wanted, margin), Math.max(margin, height - margin - blockH));

  const baselines = lines.map((_, i) => top + i * lineHeight + size);
  const authorTop = top + lines.length * lineHeight + size * AUTHOR_GAP;
  return {
    lines,
    fontSize: size,
    lineHeight,
    author,
    authorSize,
    centerX: width / 2,
    maxWidth,
    top,
    height: blockH,
    baselines,
    authorBaseline: authorTop + authorSize,
    truncated,
  };
}

/** Zone de l'écran, en pixels entiers, où se pose le texte : celle dont on mesure la luminosité. */
export function sampleBox(plan: QuotePlan, width: number, height: number): { left: number; top: number; right: number; bottom: number } {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    left: clamp(Math.floor(plan.centerX - plan.maxWidth / 2), width),
    top: clamp(Math.floor(plan.top), height),
    right: clamp(Math.ceil(plan.centerX + plan.maxWidth / 2), width),
    bottom: clamp(Math.ceil(plan.top + plan.height), height),
  };
}

/** Nombre de points mesurés par côté dans la zone du texte. */
export const SAMPLES = 24;

/** Points à mesurer dans [box] : une grille de [n] × [n] pixels, au centre de ses cases. */
export function samplePoints(box: { left: number; top: number; right: number; bottom: number }, n: number = SAMPLES): { x: number; y: number }[] {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return [];
  const points: { x: number; y: number }[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      points.push({
        x: box.left + Math.min(width - 1, Math.floor(((i + 0.5) * width) / n)),
        y: box.top + Math.min(height - 1, Math.floor(((j + 0.5) * height) / n)),
      });
    }
  }
  return points;
}

/** Luminosité moyenne (0 à 1, valeurs sRGB pondérées Rec. 709) de pixels RGBA, quatre octets par pixel. */
export function averageLuma(rgba: ArrayLike<number>): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pixels; i++) {
    sum += 0.2126 * (rgba[i * 4] as number) + 0.7152 * (rgba[i * 4 + 1] as number) + 0.0722 * (rgba[i * 4 + 2] as number);
  }
  return sum / pixels / 255;
}

/** Texte clair ou sombre : imposé (blanc, noir) ou, en automatique, celui qui contraste avec la luminosité locale. */
export function toneFor(color: QuoteColor, luma: number): Tone {
  if (color === 'white') return 'light';
  if (color === 'black') return 'dark';
  return luma > LIGHT_LUMA_THRESHOLD ? 'dark' : 'light';
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Opacité du voile (noir sous un texte clair, blanc sous un texte sombre) : plus forte quand le fond le contredit. */
export function veilAlpha(tone: Tone, luma: number): number {
  const conflict = tone === 'light' ? clamp01((luma - 0.35) / 0.45) : clamp01((0.65 - luma) / 0.45);
  return 0.14 + 0.34 * conflict;
}

/** Bande du voile : le bloc, élargi d'une ligne et un peu au-dessus et au-dessous, sur toute la largeur. */
export function veilBand(plan: QuotePlan, height: number): { top: number; bottom: number } {
  return { top: Math.max(0, plan.top - plan.fontSize * 1.2), bottom: Math.min(height, plan.top + plan.height + plan.fontSize * 1.2) };
}

/** Ombre portée du texte : douce, de la couleur opposée. */
export function shadowOf(tone: Tone, fontSize: number): { alpha: number; blur: number; dy: number } {
  return tone === 'light'
    ? { alpha: 0.55, blur: fontSize * 0.1, dy: fontSize * 0.035 }
    : { alpha: 0.45, blur: fontSize * 0.08, dy: 0 };
}

/** Police du canevas (aperçu) ; le natif utilise les polices système équivalentes. */
export function fontSpec(font: QuoteFont, role: 'text' | 'author', size: number): string {
  const px = `${Math.round(size * 100) / 100}px`;
  if (font === 'serif') {
    return role === 'text' ? `italic 400 ${px} "Noto Serif", Georgia, serif` : `400 ${px} "Noto Serif", Georgia, serif`;
  }
  return role === 'text' ? `300 ${px} Roboto, system-ui, sans-serif` : `500 ${px} Roboto, system-ui, sans-serif`;
}
