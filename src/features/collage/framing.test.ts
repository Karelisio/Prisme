import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAMING,
  type Framing,
  MAX_DECODED_PIXELS,
  MAX_ZOOM,
  clampFraming,
  coverScale,
  decodeWidth,
  isDefaultFraming,
  panFraming,
  sourceRect,
  toCellFrame,
  zoomFraming,
} from './framing';

const tall = { width: 3000, height: 6000 };
const wide = { width: 6000, height: 4000 };
const cell = { width: 540, height: 1200 };

/** Point de l'image qui se trouve à `anchor` (pixels depuis le centre de la fenêtre). */
function pointUnder(f: Framing, anchor: { x: number; y: number }, image: typeof tall, view: typeof cell) {
  const scale = coverScale(image, view) * f.zoom;
  return { x: f.cx * image.width + anchor.x / scale, y: f.cy * image.height + anchor.y / scale };
}

describe('ajustement « couvrir »', () => {
  it('au zoom 1, la photo remplit la fenêtre et reste centrée', () => {
    const portrait = sourceRect(tall, cell, DEFAULT_FRAMING);
    // 3000×6000 dans 540×1200 : l'échelle est dictée par la hauteur, les côtés sont rognés.
    expect(portrait.height).toBeCloseTo(6000);
    expect(portrait.width).toBeCloseTo(2700);
    expect(portrait.x).toBeCloseTo(150);
    expect(portrait.y).toBeCloseTo(0);
    const landscape = sourceRect(wide, cell, DEFAULT_FRAMING);
    expect(landscape.height).toBeCloseTo(4000);
    expect(landscape.width).toBeCloseTo(1800);
    expect(landscape.x + landscape.width / 2).toBeCloseTo(3000);
  });

  it('la zone visible a toujours le ratio de la fenêtre', () => {
    for (const image of [tall, wide, { width: 1000, height: 1000 }]) {
      for (const f of [DEFAULT_FRAMING, { zoom: 2.5, cx: 0.2, cy: 0.9 }]) {
        const r = sourceRect(image, cell, f);
        expect(r.width / r.height).toBeCloseTo(cell.width / cell.height, 6);
      }
    }
  });

  it('ne sort jamais de l’image, quels que soient le cadrage demandé et la fenêtre', () => {
    const views = [cell, { width: 1080, height: 800 }, { width: 640, height: 640 }, { width: 100, height: 1500 }];
    for (const image of [tall, wide, { width: 500, height: 500 }]) {
      for (const view of views) {
        for (const zoom of [0.2, 1, 1.7, 4, 9]) {
          for (const cx of [-1, 0, 0.3, 0.5, 1, 2]) {
            for (const cy of [-1, 0, 0.7, 1, 3]) {
              const r = sourceRect(image, view, { zoom, cx, cy });
              expect(r.x).toBeGreaterThanOrEqual(-1e-6);
              expect(r.y).toBeGreaterThanOrEqual(-1e-6);
              expect(r.x + r.width).toBeLessThanOrEqual(image.width + 1e-6);
              expect(r.y + r.height).toBeLessThanOrEqual(image.height + 1e-6);
            }
          }
        }
      }
    }
  });

  it('borne le zoom entre 1 et le maximum', () => {
    expect(clampFraming({ zoom: 0.3, cx: 0.5, cy: 0.5 }, tall, cell).zoom).toBe(1);
    expect(clampFraming({ zoom: 99, cx: 0.5, cy: 0.5 }, tall, cell).zoom).toBe(MAX_ZOOM);
  });

  it('un axe entièrement visible ne peut pas bouger', () => {
    // La photo est cadrée sur toute sa hauteur : seul le déplacement horizontal est possible.
    const f = clampFraming({ zoom: 1, cx: 0.9, cy: 0.1 }, tall, cell);
    expect(f.cy).toBeCloseTo(0.5);
    expect(f.cx).toBeCloseTo(1 - 2700 / 3000 / 2);
    expect(clampFraming(f, tall, cell)).toEqual(f);
  });

  it('ne plante pas sur des tailles nulles', () => {
    expect(clampFraming({ zoom: 2, cx: 0.2, cy: 0.2 }, { width: 0, height: 0 }, cell)).toEqual(DEFAULT_FRAMING);
    expect(clampFraming({ zoom: 2, cx: 0.2, cy: 0.2 }, tall, { width: 0, height: 0 })).toEqual(DEFAULT_FRAMING);
  });
});

describe('déplacement', () => {
  it('la photo suit le doigt : glisser vers la droite montre la partie de gauche', () => {
    const start = { zoom: 1, cx: 0.5, cy: 0.5 };
    const right = panFraming(start, 20, 0, tall, cell);
    expect(right.cx).toBeLessThan(start.cx);
    const left = panFraming(start, -20, 0, tall, cell);
    expect(left.cx).toBeGreaterThan(start.cx);
    // 20 px de fenêtre = 20 / échelle pixels d'image (ici 100 px, dans la marge de 150 px de chaque côté).
    const scale = coverScale(tall, cell);
    expect((start.cx - right.cx) * tall.width).toBeCloseTo(20 / scale);
  });

  it('s’arrête aux bords de la photo', () => {
    const far = panFraming(DEFAULT_FRAMING, 100_000, 0, tall, cell);
    const rect = sourceRect(tall, cell, far);
    expect(rect.x).toBeCloseTo(0);
    const zoomed = { zoom: 2, cx: 0.5, cy: 0.5 };
    const down = panFraming(zoomed, 0, 100_000, tall, cell);
    expect(sourceRect(tall, cell, down).y).toBeCloseTo(0);
    const up = panFraming(zoomed, 0, -100_000, tall, cell);
    const r = sourceRect(tall, cell, up);
    expect(r.y + r.height).toBeCloseTo(tall.height);
  });

  it('ne bouge pas sur l’axe où tout est visible', () => {
    const f = panFraming(DEFAULT_FRAMING, 0, 300, tall, cell);
    expect(f.cy).toBeCloseTo(0.5);
  });
});

describe('zoom', () => {
  it('le point sous les doigts reste fixe', () => {
    const start: Framing = { zoom: 1.5, cx: 0.45, cy: 0.5 };
    for (const anchor of [
      { x: 0, y: 0 },
      { x: 100, y: -200 },
      { x: -120, y: 300 },
    ]) {
      const before = pointUnder(start, anchor, tall, cell);
      const next = zoomFraming(start, 1.4, anchor, tall, cell);
      expect(next.zoom).toBeCloseTo(2.1);
      const after = pointUnder(next, anchor, tall, cell);
      expect(after.x).toBeCloseTo(before.x, 3);
      expect(after.y).toBeCloseTo(before.y, 3);
    }
  });

  it('zoomer puis dézoomer revient au cadrage de départ', () => {
    const start: Framing = { zoom: 1.2, cx: 0.5, cy: 0.5 };
    const anchor = { x: 40, y: 60 };
    const back = zoomFraming(zoomFraming(start, 2, anchor, tall, cell), 0.5, anchor, tall, cell);
    expect(back.zoom).toBeCloseTo(start.zoom);
    expect(back.cx).toBeCloseTo(start.cx, 6);
    expect(back.cy).toBeCloseTo(start.cy, 6);
  });

  it('respecte les limites de zoom', () => {
    expect(zoomFraming(DEFAULT_FRAMING, 1000, { x: 0, y: 0 }, tall, cell).zoom).toBe(MAX_ZOOM);
    expect(zoomFraming(DEFAULT_FRAMING, 0.001, { x: 0, y: 0 }, tall, cell)).toEqual(DEFAULT_FRAMING);
    const out = zoomFraming({ zoom: 2, cx: 0.2, cy: 0.3 }, 0.01, { x: 50, y: 50 }, tall, cell);
    expect(out.zoom).toBe(1);
    expect(clampFraming(out, tall, cell)).toEqual(out);
  });

  it('reste dans l’image même en zoomant près d’un bord', () => {
    const corner = { x: -270, y: -600 };
    const f = zoomFraming({ zoom: 1, cx: 0.5, cy: 0.5 }, 3, corner, wide, cell);
    const r = sourceRect(wide, cell, f);
    expect(r.x).toBeGreaterThanOrEqual(-1e-6);
    expect(r.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it('reconnaît le cadrage par défaut', () => {
    expect(isDefaultFraming(DEFAULT_FRAMING)).toBe(true);
    expect(isDefaultFraming({ zoom: 1.0004, cx: 0.5003, cy: 0.5 })).toBe(true);
    expect(isDefaultFraming({ zoom: 1.2, cx: 0.5, cy: 0.5 })).toBe(false);
    expect(isDefaultFraming({ zoom: 1, cx: 0.55, cy: 0.5 })).toBe(false);
  });
});

describe('repère d’une case tournée', () => {
  it('ramène un déplacement à l’écran dans le repère de la case', () => {
    const angle = (30 * Math.PI) / 180;
    // Le bord « droit » d'une case tournée de 30° pointe vers (cos, sin) à l'écran.
    const along = toCellFrame({ x: Math.cos(angle), y: Math.sin(angle) }, angle);
    expect(along.x).toBeCloseTo(1);
    expect(along.y).toBeCloseTo(0);
    const down = toCellFrame({ x: -Math.sin(angle), y: Math.cos(angle) }, angle);
    expect(down.x).toBeCloseTo(0);
    expect(down.y).toBeCloseTo(1);
    expect(toCellFrame({ x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
    expect(Math.hypot(...Object.values(toCellFrame({ x: 3, y: 4 }, 1.1)))).toBeCloseTo(5);
  });
});

describe('largeur de décodage', () => {
  const windows = [
    { width: 1080, height: 1440 },
    { width: 540, height: 960 },
  ];

  it('couvre la plus grande fenêtre avec une réserve de zoom', () => {
    // Portrait 9:16 : la plus grande fenêtre dicte 1080 px de large, plus la réserve.
    const w = decodeWidth({ width: 4000, height: 7111 }, windows);
    expect(w).toBeGreaterThanOrEqual(1080);
    expect(w).toBeLessThanOrEqual(1080 * 2);
  });

  it('une photo paysage a besoin d’être décodée plus large pour une case haute', () => {
    const tallCell = [{ width: 540, height: 2400 }];
    const landscape = decodeWidth({ width: 6000, height: 4000 }, tallCell);
    const portrait = decodeWidth({ width: 4000, height: 6000 }, tallCell);
    expect(landscape).toBeGreaterThan(portrait);
  });

  it('ne dépasse ni l’image d’origine, ni le budget de pixels, ni 4096 px', () => {
    expect(decodeWidth({ width: 800, height: 1200 }, windows)).toBe(800);
    const huge = decodeWidth({ width: 12_000, height: 2000 }, [{ width: 540, height: 3000 }]);
    expect(huge).toBeLessThanOrEqual(4096);
    const aspect = 12_000 / 2000;
    expect((huge * huge) / aspect).toBeLessThanOrEqual(MAX_DECODED_PIXELS);
    expect(decodeWidth({ width: 0, height: 0 }, windows)).toBeGreaterThan(0);
    expect(decodeWidth({ width: 3000, height: 6000 }, [])).toBeGreaterThan(0);
  });
});
