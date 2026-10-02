import { describe, expect, it } from 'vitest';
import {
  EFFECTS,
  MOSAIC_JITTER,
  PIXEL_PALETTE_SIZE,
  type Pixels,
  type Steps,
  cellNoise,
  coverageOfRadius,
  dotRadiusForCoverage,
  drain,
  drainAsync,
  halftone,
  kuwahara,
  makeGrid,
  mosaic,
  paintRadius,
  pixelArt,
  runEffect,
} from './effects';

function image(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

/** Bruit pseudo-aléatoire reproductible. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const colorsOf = ({ data }: Pixels) => {
  const set = new Set<number>();
  for (let i = 0; i < data.length; i += 4) set.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  return set;
};
const at = ({ data, width }: Pixels, x: number, y: number) => {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
};

describe('grille de cellules', () => {
  it('couvre toute l’image, sans trou ni cellule vide', () => {
    const grid = makeGrid(1082, 2402, 104);
    expect(grid.xs[0]).toBe(0);
    expect(grid.xs[grid.cols]).toBe(1082);
    expect(grid.ys[0]).toBe(0);
    expect(grid.ys[grid.rows]).toBe(2402);
    for (let i = 0; i < grid.cols; i++) expect(grid.xs[i + 1]!).toBeGreaterThan(grid.xs[i]!);
    for (let j = 0; j < grid.rows; j++) expect(grid.ys[j + 1]!).toBeGreaterThan(grid.ys[j]!);
  });

  it('aperçu réduit et export donnent la même composition (même nombre de cellules)', () => {
    const preview = makeGrid(279, 620, 104);
    const full = makeGrid(1082, 2402, 104);
    expect(preview.cols).toBe(full.cols);
    expect(Math.abs(preview.rows - full.rows)).toBeLessThanOrEqual(1);
  });

  it('plafonne le nombre de colonnes à la largeur', () => {
    expect(makeGrid(10, 10, 500).cols).toBe(10);
    expect(makeGrid(10, 10, 0).cols).toBe(1);
  });
});

describe('pixel art', () => {
  const gradient = image(120, 90, (x, y) => [x * 2, y * 2, (x + y) % 256]);

  it('ramène les couleurs à une palette réduite', () => {
    expect(colorsOf(gradient).size).toBeGreaterThan(100);
    const art = drain(pixelArt(gradient, 0.9));
    expect(colorsOf(art).size).toBeLessThanOrEqual(PIXEL_PALETTE_SIZE);
    expect(colorsOf(art).size).toBeGreaterThan(4);
  });

  it('pixellise : une cellule est d’une seule couleur, et plus on pousse le curseur, plus les blocs grossissent', () => {
    const art = drain(pixelArt(gradient, 1));
    const grid = makeGrid(120, 90, 28);
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        const first = at(art, grid.xs[i]!, grid.ys[j]!);
        for (let y = grid.ys[j]!; y < grid.ys[j + 1]!; y++) {
          for (let x = grid.xs[i]!; x < grid.xs[i + 1]!; x++) expect(at(art, x, y)).toEqual(first);
        }
      }
    }
    expect(makeGrid(120, 90, 28).cols).toBeLessThan(makeGrid(120, 90, 100).cols);
  });

  it('garde les couleurs d’une image à deux teintes', () => {
    const flag = image(60, 40, (x) => (x < 30 ? [200, 30, 30] : [30, 30, 200]));
    const art = drain(pixelArt(flag, 0.5));
    expect(colorsOf(art).size).toBe(2);
    expect(at(art, 2, 2)).toEqual([200, 30, 30]);
    expect(at(art, 57, 37)).toEqual([30, 30, 200]);
    expect(art.width).toBe(60);
    expect(art.height).toBe(40);
  });
});

describe('mosaïque', () => {
  const gray = image(160, 160, () => [128, 128, 128]);

  it('dessine des tesselles séparées par des joints sombres', () => {
    const art = drain(mosaic(gray, 0.8));
    const grid = makeGrid(160, 160, Math.round(90 + (14 - 90) * 0.8));
    let dark = 0;
    for (let i = 0; i < art.data.length; i += 4) if (art.data[i]! < 80) dark++;
    const share = dark / (160 * 160);
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.4);
    // Au milieu d'une tesselle : la couleur de la zone, à l'irrégularité et au biseau près.
    const cx = Math.floor((grid.xs[3]! + grid.xs[4]!) / 2);
    const cy = Math.floor((grid.ys[3]! + grid.ys[4]!) / 2);
    const [r] = at(art, cx, cy);
    expect(r).toBeGreaterThan(128 * (1 - MOSAIC_JITTER / 2) - 2);
    expect(r).toBeLessThan(128 * (1 + MOSAIC_JITTER / 2) + 2);
    // Sur la frontière entre deux tesselles : le joint.
    expect(at(art, grid.xs[3]! - 1, cy)[0]).toBeLessThan(80);
  });

  it('est déterministe et irrégulier d’une tesselle à l’autre', () => {
    expect(drain(mosaic(gray, 0.5)).data).toEqual(drain(mosaic(gray, 0.5)).data);
    const values = new Set<number>();
    for (let i = 0; i < 20; i++) values.add(cellNoise(i, 3));
    expect(values.size).toBe(20);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(cellNoise(4, 9)).toBe(cellNoise(4, 9));
  });
});

describe('trame', () => {
  // Cellules assez grandes (20 colonnes sur 400 px) pour que le bord adouci d'un pixel pèse peu.
  const shade = (value: number) => image(400, 400, () => [value, value, value]);
  /** Part de l'image où le point recouvre plus de la moitié du pixel (bord adouci à mi-chemin). */
  const bright = (p: Pixels) => {
    let count = 0;
    for (let i = 0; i < p.data.length; i += 4) if (p.data[i]! > 132) count++;
    return count / (p.width * p.height);
  };

  it('le rayon d’un point suit la part de cellule recouverte', () => {
    expect(coverageOfRadius(0)).toBe(0);
    expect(coverageOfRadius(0.5)).toBeCloseTo(Math.PI / 4);
    expect(coverageOfRadius(Math.SQRT1_2)).toBeCloseTo(1);
    expect(coverageOfRadius(2)).toBe(1);
    let previous = -1;
    for (let r = 0; r <= 0.72; r += 0.02) {
      const c = coverageOfRadius(r);
      expect(c).toBeGreaterThanOrEqual(previous);
      previous = c;
    }
    for (const r of [0.1, 0.3, 0.5, 0.6, 0.7]) expect(dotRadiusForCoverage(coverageOfRadius(r))).toBeCloseTo(r, 3);
    expect(dotRadiusForCoverage(0)).toBe(0);
    expect(dotRadiusForCoverage(1)).toBeCloseTo(Math.SQRT1_2);
  });

  it('respecte la tonalité : noir = fond, blanc = tout couvert, gris moyen = environ la moitié', () => {
    expect(bright(drain(halftone(shade(0), 1)))).toBe(0);
    expect(bright(drain(halftone(shade(255), 1)))).toBeGreaterThan(0.99);
    const half = bright(drain(halftone(shade(128), 1)));
    expect(half).toBeGreaterThan(0.45);
    expect(half).toBeLessThan(0.56);
    const dark = bright(drain(halftone(shade(51), 1)));
    const light = bright(drain(halftone(shade(204), 1)));
    expect(dark).toBeGreaterThan(0.14);
    expect(dark).toBeLessThan(0.26);
    expect(light).toBeGreaterThan(0.74);
    expect(light).toBeLessThan(0.86);
    expect(dark).toBeLessThan(half);
    expect(light).toBeGreaterThan(half);
  });

  it('des points ronds de la teinte de la zone, sur fond sombre', () => {
    const art = drain(halftone(image(180, 180, () => [200, 100, 0]), 0.5));
    let best: readonly [number, number, number] = [0, 0, 0];
    for (let i = 0; i < art.data.length; i += 4) if (art.data[i]! > best[0]) best = [art.data[i]!, art.data[i + 1]!, art.data[i + 2]!];
    expect(best[0]).toBeGreaterThan(250);
    expect(best[1] / best[0]).toBeGreaterThan(0.45);
    expect(best[1] / best[0]).toBeLessThan(0.55);
    expect(best[2]).toBeLessThan(5);
    // Le fond reste sombre entre les points.
    let darkest = 255;
    for (let i = 0; i < art.data.length; i += 4) darkest = Math.min(darkest, art.data[i]!);
    expect(darkest).toBeLessThan(30);
  });
});

describe('peinture (Kuwahara)', () => {
  it('une image unie ne change pas', () => {
    const flat = image(40, 30, () => [90, 140, 200]);
    const out = drain(kuwahara(flat, 3));
    expect([...out.data]).toEqual([...flat.data]);
  });

  it('lisse les aplats bruités sans estomper le contour entre deux zones', () => {
    const noise = random(7);
    const noisy = image(80, 60, (x) => {
      const base = x < 40 ? 60 : 190;
      const n = (noise() - 0.5) * 50;
      return [base + n, base + n, base + n];
    });
    const out = drain(kuwahara(noisy, 4));
    const variance = (p: Pixels, x0: number, x1: number) => {
      const values: number[] = [];
      for (let y = 8; y < 52; y++) for (let x = x0; x < x1; x++) values.push(at(p, x, y)[0]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    };
    expect(variance(out, 8, 32)).toBeLessThan(variance(noisy, 8, 32) / 4);
    expect(variance(out, 48, 72)).toBeLessThan(variance(noisy, 48, 72) / 4);
    // Le contour reste net : juste de part et d'autre, on retrouve chaque zone.
    for (let y = 10; y < 50; y++) {
      expect(at(out, 38, y)[0]).toBeLessThan(110);
      expect(at(out, 41, y)[0]).toBeGreaterThan(140);
    }
  });

  it('donne exactement le résultat du calcul direct, bords de l’image compris', () => {
    const noise = random(42);
    const w = 23;
    const h = 19;
    const src = image(w, h, () => [noise() * 255, noise() * 255, noise() * 255]);
    for (const r of [1, 2, 4]) {
      const out = drain(kuwahara(src, r));
      const lum = (x: number, y: number) => {
        const [cr, cg, cb] = at(src, x, y);
        return (cr * 77 + cg * 151 + cb * 28) >> 8;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let best = Number.POSITIVE_INFINITY;
          let chosen: [number, number, number] = [0, 0, 0];
          for (let q = 0; q < 4; q++) {
            const x0 = q & 1 ? x : Math.max(0, x - r);
            const x1 = q & 1 ? Math.min(w - 1, x + r) : x;
            const y0 = q & 2 ? y : Math.max(0, y - r);
            const y1 = q & 2 ? Math.min(h - 1, y + r) : y;
            let n = 0;
            let sy = 0;
            let sq = 0;
            const sum = [0, 0, 0];
            for (let yy = y0; yy <= y1; yy++) {
              for (let xx = x0; xx <= x1; xx++) {
                n++;
                const l = lum(xx, yy);
                sy += l;
                sq += l * l;
                const c = at(src, xx, yy);
                sum[0]! += c[0];
                sum[1]! += c[1];
                sum[2]! += c[2];
              }
            }
            const mean = sy / n;
            const variance = sq / n - mean * mean;
            if (variance < best) {
              best = variance;
              chosen = [sum[0]! / n, sum[1]! / n, sum[2]! / n];
            }
          }
          const expected = new Uint8ClampedArray(chosen);
          expect([...at(out, x, y)], `r=${r} (${x}, ${y})`).toEqual([...expected]);
        }
      }
    }
  });

  it('le rayon suit la largeur de rendu : aperçu réduit et export donnent le même aspect', () => {
    expect(paintRadius(1080, 0.5)).toBeGreaterThan(paintRadius(360, 0.5) * 2);
    expect(paintRadius(1080, 1)).toBeGreaterThan(paintRadius(1080, 0));
    expect(paintRadius(10, 0)).toBe(1);
    expect(paintRadius(100000, 1)).toBe(24);
  });
});

describe('effets : répartition du calcul', () => {
  it('propose les effets demandés', () => {
    expect(EFFECTS.map((e) => e.label)).toEqual(['Aucun', 'Pixel art', 'Mosaïque', 'Trame', 'Peinture']);
  });

  it('runEffect : aucun effet renvoie l’image telle quelle ; l’intensité est bornée', () => {
    const src = image(20, 20, () => [10, 20, 30]);
    expect(drain(runEffect(src, { kind: 'none', amount: 0.5 }))).toBe(src);
    expect(drain(runEffect(src, { kind: 'pixel', amount: 5 })).width).toBe(20);
    expect(drain(runEffect(src, { kind: 'paint', amount: -3 })).height).toBe(20);
  });

  it('cède la main plusieurs fois sur une image de la taille d’un écran', () => {
    const big = image(540, 1200, (x, y) => [x % 256, y % 256, (x + y) % 256]);
    for (const kind of ['pixel', 'mosaic', 'halftone', 'paint'] as const) {
      let yields = 0;
      const steps = runEffect(big, { kind, amount: 0.5 });
      let step = steps.next();
      while (!step.done) {
        yields++;
        step = steps.next();
      }
      expect(yields, kind).toBeGreaterThan(10);
    }
  });

  it('découpé en tranches ou d’une traite, le résultat est le même', async () => {
    const src = image(90, 120, (x, y) => [x * 2, y, (x * y) % 256]);
    for (const kind of ['pixel', 'mosaic', 'halftone', 'paint'] as const) {
      const direct = drain(runEffect(src, { kind, amount: 0.4 }));
      const sliced = await drainAsync(runEffect(src, { kind, amount: 0.4 }), undefined, 0);
      expect([...sliced!.value.data], kind).toEqual([...direct.data]);
    }
  });

  it('laisse la main au navigateur entre deux tranches', async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    function* busy(): Steps<number> {
      for (let i = 0; i < 40; i++) {
        const end = performance.now() + 1;
        while (performance.now() < end);
        yield;
      }
      return 40;
    }
    const result = await drainAsync(busy(), undefined, 2);
    clearInterval(timer);
    expect(result?.value).toBe(40);
    expect(ticks).toBeGreaterThan(2);
  });

  it('s’interrompt dès que le signal est annulé, en libérant le générateur', async () => {
    const controller = new AbortController();
    let cleaned = false;
    let steps = 0;
    function* endless(): Steps<number> {
      try {
        for (let i = 0; ; i++) {
          steps++;
          if (i === 5) controller.abort();
          yield;
        }
      } finally {
        cleaned = true;
      }
    }
    expect(await drainAsync(endless(), controller.signal, 0)).toBeNull();
    expect(cleaned).toBe(true);
    expect(steps).toBe(6);
  });
});
