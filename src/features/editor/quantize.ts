import { type RGB, colorDistance, toHex } from './color';

export interface Cluster {
  color: RGB;
  /** Nombre de couleurs de l'entrée rattachées à ce groupe. */
  count: number;
}

/** Au-delà, l'entrée est échantillonnée : la palette reste stable et le calcul borné. */
const MAX_SAMPLES = 16384;
const REFINE_PASSES = 3;
/** Deux couleurs plus proches que cela (distance RGB) comptent pour une seule dominante. */
const MIN_DISTINCT = 48;

interface Box {
  start: number;
  end: number;
  channel: number;
  range: number;
}

/**
 * Regroupe des couleurs (triplets RGB à plat) en au plus `k` groupes : coupes médianes, puis quelques
 * passes de k-moyennes pour que chaque groupe tombe sur la vraie moyenne de ses couleurs.
 * Résultat trié du plus au moins peuplé ; déterministe.
 */
export function quantize(rgb: ArrayLike<number>, k: number): Cluster[] {
  const total = Math.floor(rgb.length / 3);
  if (total === 0 || k < 1) return [];

  const step = Math.max(1, Math.ceil(total / MAX_SAMPLES));
  const n = Math.ceil(total / step);
  const points = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < total; i += step, j += 3) {
    points[j] = rgb[i * 3] ?? 0;
    points[j + 1] = rgb[i * 3 + 1] ?? 0;
    points[j + 2] = rgb[i * 3 + 2] ?? 0;
  }

  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const measure = (start: number, end: number): Box => {
    const lo = [255, 255, 255];
    const hi = [0, 0, 0];
    for (let i = start; i < end; i++) {
      const p = (order[i] as number) * 3;
      for (let c = 0; c < 3; c++) {
        const v = points[p + c] as number;
        if (v < (lo[c] as number)) lo[c] = v;
        if (v > (hi[c] as number)) hi[c] = v;
      }
    }
    let channel = 0;
    let range = 0;
    for (let c = 0; c < 3; c++) {
      const r = (hi[c] as number) - (lo[c] as number);
      if (r > range) {
        range = r;
        channel = c;
      }
    }
    return { start, end, channel, range };
  };

  const boxes: Box[] = [measure(0, n)];
  while (boxes.length < k) {
    let pick = -1;
    let best = 0;
    boxes.forEach((box, i) => {
      const size = box.end - box.start;
      // La portée seule couperait de minuscules boîtes aberrantes : on pondère par le nombre de couleurs.
      const score = box.range * Math.sqrt(size);
      if (size > 1 && box.range > 0 && score > best) {
        best = score;
        pick = i;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick] as Box;
    const channel = box.channel;
    order.subarray(box.start, box.end).sort((a, b) => (points[a * 3 + channel] as number) - (points[b * 3 + channel] as number));
    const mid = (box.start + box.end) >> 1;
    boxes.splice(pick, 1, measure(box.start, mid), measure(mid, box.end));
  }

  const centers = boxes.map((box) => {
    const sum = [0, 0, 0];
    for (let i = box.start; i < box.end; i++) {
      const p = (order[i] as number) * 3;
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (points[p + c] as number);
    }
    const size = box.end - box.start;
    return [(sum[0] as number) / size, (sum[1] as number) / size, (sum[2] as number) / size];
  });

  const counts = new Float64Array(centers.length);
  const assign = () => {
    counts.fill(0);
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const r = points[i * 3] as number;
      const g = points[i * 3 + 1] as number;
      const b = points[i * 3 + 2] as number;
      let nearest = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c++) {
        const center = centers[c] as number[];
        const d = ((center[0] as number) - r) ** 2 + ((center[1] as number) - g) ** 2 + ((center[2] as number) - b) ** 2;
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = c;
        }
      }
      const s = sums[nearest] as number[];
      s[0] = (s[0] as number) + r;
      s[1] = (s[1] as number) + g;
      s[2] = (s[2] as number) + b;
      s[3] = (s[3] as number) + 1;
      counts[nearest] = (counts[nearest] as number) + 1;
    }
    return sums;
  };

  let sums = assign();
  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    sums.forEach((s, c) => {
      const members = s[3] as number;
      if (members > 0) centers[c] = [(s[0] as number) / members, (s[1] as number) / members, (s[2] as number) / members];
    });
    sums = assign();
  }

  const scale = total / n;
  return centers
    .map((center, c): Cluster => ({ color: [center[0] as number, center[1] as number, center[2] as number], count: Math.round((counts[c] as number) * scale) }))
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Indice de la couleur de la palette la plus proche (distance RGB au carré). */
export function nearestColor(palette: readonly RGB[], r: number, g: number, b: number): number {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i] as RGB;
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  return nearest;
}

/**
 * Couleurs dominantes d'une image (pixels RGBA), de la plus présente à la moins présente.
 * Les teintes quasi identiques sont fusionnées pour proposer un vrai choix.
 */
export function dominantColors(rgba: ArrayLike<number>, count: number): string[] {
  const rgb: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] as number) < 128) continue;
    rgb.push(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number);
  }
  const clusters = quantize(rgb, Math.max(count * 2, 8));
  const picked: Cluster[] = [];
  for (const cluster of clusters) {
    if (picked.length >= count) break;
    if (picked.every((p) => colorDistance(p.color, cluster.color) >= MIN_DISTINCT)) picked.push(cluster);
  }
  return picked.map((cluster) => toHex(cluster.color));
}
