import { deflateSync } from 'node:zlib';

/** PNG RGB 8 bits généré à la volée : évite de versionner des images de test. */
export function pngFromPixels(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const MARKER = 40;
export const RED = [255, 0, 0] as const;
export const BLUE = [0, 0, 255] as const;

const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + ((b[i] as number) - v) * t) as [number, number, number];

/** Bruit stable, pour donner du grain aux aplats (les effets y sont plus lisibles). */
function noise(x: number, y: number): number {
  let h = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Paysage de test : ciel dégradé, soleil, deux chaînes de montagnes, prairie. Un carré rouge marque le
 * coin haut-gauche et un carré bleu le coin bas-droit : on voit tout de suite si la photo est tournée.
 */
export function scene(width: number, height: number): Buffer {
  return pngFromPixels(width, height, (x, y) => {
    const u = x / width;
    const v = y / height;
    if (x < MARKER && y < MARKER) return RED;
    if (x >= width - MARKER && y >= height - MARKER) return BLUE;
    const sun = Math.hypot((u - 0.68) * (width / height), v - 0.5) < 0.07;
    if (sun) return [255, 240, 200];
    const far = 0.62 + 0.05 * Math.sin(u * 9) + 0.03 * Math.sin(u * 23 + 1);
    const near = 0.74 + 0.04 * Math.sin(u * 6 + 2) + 0.02 * Math.sin(u * 31);
    const grain = (noise(x, y) - 0.5) * 18;
    let color: readonly [number, number, number];
    if (v > near) color = mix([50, 120, 60], [30, 80, 45], (v - near) / (1 - near));
    else if (v > far) color = mix([90, 80, 130], [50, 50, 90], (v - far) / (near - far));
    else color = mix([30, 70, 160], [255, 175, 95], Math.min(1, v / far) ** 1.8);
    return [color[0] + grain, color[1] + grain, color[2] + grain].map((c) => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
  });
}
