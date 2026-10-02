/** Couleur RGB, composantes de 0 à 255. */
export type RGB = readonly [r: number, g: number, b: number];

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** « #rgb » ou « #rrggbb » ; noir si le texte n'est pas une couleur. */
export function parseHex(hex: string): RGB {
  let digits = hex.trim().replace(/^#/, '');
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(digits)) return [0, 0, 0];
  const n = Number.parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(color: RGB): string {
  return `#${color.map((v) => Math.round(clampByte(v)).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminance perçue (coefficients Rec. 709, comme le filtre CSS `grayscale`). */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
