// Couleurs du générateur : conversions hexadécimal / sRGB / OKLab et mélanges perceptuels.
// Fonctions pures, sans dépendance au DOM : elles servent aussi bien à l'aperçu qu'à l'export.

/** Triplet rouge, vert, bleu (0 à 255, éventuellement fractionnaire). */
export type RGB = [number, number, number];
/** Coordonnées OKLab : clarté perceptuelle L (0 à 1), axes a (vert - rouge) et b (bleu - jaune). */
export type Lab = [number, number, number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Lit « #rgb » ou « #rrggbb » ; toute valeur invalide donne du noir. */
export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return [0, 0, 0];
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: RGB): string {
  const part = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function toLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const v = clamp(value, 0, 1);
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
}

export function rgbToOklab([r, g, b]: RGB): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Repasse en sRGB (0 à 255, borné) ; les couleurs hors gamut sont ramenées à la limite. */
export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export const hexToOklab = (hex: string): Lab => rgbToOklab(parseHex(hex));
export const oklabToHex = (lab: Lab): string => toHex(oklabToRgb(lab));

/** Mélange perceptuel (OKLab) de deux couleurs : t = 0 donne `a`, t = 1 donne `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const [l1, a1, b1] = hexToOklab(a);
  const [l2, a2, b2] = hexToOklab(b);
  return oklabToHex([l1 + (l2 - l1) * t, a1 + (a2 - a1) * t, b1 + (b2 - b1) * t]);
}

/** Clarté perceptuelle (OKLab L) : 0 pour le noir, 1 pour le blanc. */
export function lightness(hex: string): number {
  return hexToOklab(hex)[0];
}

/** Éclaircit (delta > 0) ou assombrit (delta < 0) en gardant la teinte et la saturation. */
export function shiftLightness(hex: string, delta: number): string {
  const [L, a, b] = hexToOklab(hex);
  const next = L + delta;
  // Aux extrêmes il ne reste ni teinte ni saturation : noir ou blanc franc.
  if (next <= 0) return '#000000';
  if (next >= 1) return '#ffffff';
  return oklabToHex([next, a, b]);
}

/**
 * Trie les couleurs de la plus claire à la plus sombre et, si deux voisines sont trop proches en
 * clarté, assombrit la plus sombre pour que l'écart minimal `gap` (OKLab L) soit respecté.
 */
export function spreadLightness(colors: readonly string[], gap: number): string[] {
  const sorted = [...colors].sort((a, b) => lightness(b) - lightness(a));
  for (let i = 1; i < sorted.length; i++) {
    const deficit = gap - (lightness(sorted[i - 1] as string) - lightness(sorted[i] as string));
    if (deficit > 0) sorted[i] = shiftLightness(sorted[i] as string, -deficit);
  }
  return sorted;
}

/** Dégradé multi-étapes en OKLab : renvoie les coordonnées de la couleur à la position t (0 à 1). */
export function makeLabRamp(stops: readonly string[]): (t: number) => Lab {
  const labs = stops.length > 0 ? stops.map(hexToOklab) : [[0, 0, 0] as Lab];
  const last = labs.length - 1;
  return (t) => {
    if (last === 0) return [...(labs[0] as Lab)];
    const x = clamp(t, 0, 1) * last;
    const i = Math.min(last - 1, Math.floor(x));
    const f = x - i;
    const [l1, a1, b1] = labs[i] as Lab;
    const [l2, a2, b2] = labs[i + 1] as Lab;
    return [l1 + (l2 - l1) * f, a1 + (a2 - a1) * f, b1 + (b2 - b1) * f];
  };
}

/** Comme `makeLabRamp`, mais renvoie directement la couleur en hexadécimal. */
export function makeRamp(stops: readonly string[]): (t: number) => string {
  const ramp = makeLabRamp(stops);
  return (t) => oklabToHex(ramp(t));
}

/** Six couleurs : fond, accent doux, contraste, puis trois teintes d'appoint. */
export type Palette6 = [string, string, string, string, string, string];

/**
 * Palette complète de six couleurs : les trois couleurs de base (fond, accent doux, contraste),
 * puis trois teintes d'appoint. Fournies (rôles d'accent Material You), elles contrastent avec le
 * fond ; sinon elles sont dérivées en rapprochant les couleurs de base de la couleur de contraste.
 */
export function completePalette(colors: readonly string[], accents?: readonly string[]): Palette6 {
  const c1 = colors[0] ?? '#808080';
  const c2 = colors[1] ?? c1;
  const c3 = colors[2] ?? c2;
  return [c1, c2, c3, accents?.[0] ?? mixHex(c2, c3, 0.35), accents?.[1] ?? mixHex(c1, c3, 0.5), accents?.[2] ?? mixHex(c2, c3, 0.7)];
}
