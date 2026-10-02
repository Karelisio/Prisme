import { describe, expect, it } from 'vitest';
import {
  BACKDROP_ZOOM,
  type Geometry,
  MAX_STRAIGHTEN,
  MAX_ZOOM,
  type Matrix,
  type Placement,
  type Turns,
  backdropPlacement,
  clampGeometry,
  containPlacement,
  coverScale,
  initialGeometry,
  isReoriented,
  mirrorGeometry,
  orientationMatrix,
  orientedSize,
  panGeometry,
  placementCorners,
  resolvePlacement,
  rotateGeometry,
  straightenGeometry,
  viewFromCrop,
  zoomGeometry,
} from './geometry';
import { coverCrop } from './render';

const source = { width: 3000, height: 2000 };
const out = { width: 1080, height: 2400 };
const TURNS: Turns[] = [0, 1, 2, 3];
const EPS = 1e-6;

const geometry = (over: Partial<Geometry> = {}): Geometry => ({ turns: 0, mirror: false, straighten: 0, view: { x: 0.5, y: 0.5, zoom: 1 }, ...over });

function apply(m: Matrix, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Où un point de l'image orientée atterrit dans la sortie. */
function toOutput(p: Placement, x: number, y: number) {
  const rad = (p.angle * Math.PI) / 180;
  const dx = (x - p.cx) * p.scale;
  const dy = (y - p.cy) * p.scale;
  return { x: out.width / 2 + dx * Math.cos(rad) - dy * Math.sin(rad), y: out.height / 2 + dx * Math.sin(rad) + dy * Math.cos(rad) };
}

describe('orientation', () => {
  it('les quarts de tour impairs échangent largeur et hauteur', () => {
    expect(orientedSize(source, 0)).toEqual({ width: 3000, height: 2000 });
    expect(orientedSize(source, 1)).toEqual({ width: 2000, height: 3000 });
    expect(orientedSize(source, 2)).toEqual({ width: 3000, height: 2000 });
    expect(orientedSize(source, 3)).toEqual({ width: 2000, height: 3000 });
  });

  it('un quart de tour horaire envoie le coin haut-gauche en haut à droite', () => {
    expect(apply(orientationMatrix(source, 1, false), 0, 0)).toEqual({ x: 2000, y: 0 });
    expect(apply(orientationMatrix(source, 1, false), 0, 2000)).toEqual({ x: 0, y: 0 });
    expect(apply(orientationMatrix(source, 2, false), 0, 0)).toEqual({ x: 3000, y: 2000 });
    expect(apply(orientationMatrix(source, 3, false), 0, 0)).toEqual({ x: 0, y: 3000 });
  });

  it('le miroir retourne l’image orientée de gauche à droite', () => {
    expect(apply(orientationMatrix(source, 0, true), 0, 0)).toEqual({ x: 3000, y: 0 });
    // Quart de tour puis miroir : le coin haut-gauche (en haut à droite après la rotation) revient en haut à gauche.
    expect(apply(orientationMatrix(source, 1, true), 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('les quatre coins de la source remplissent exactement l’image orientée, pour les huit orientations', () => {
    for (const turns of TURNS) {
      for (const mirror of [false, true]) {
        const m = orientationMatrix(source, turns, mirror);
        const o = orientedSize(source, turns);
        const corners = [apply(m, 0, 0), apply(m, 3000, 0), apply(m, 0, 2000), apply(m, 3000, 2000)];
        expect(Math.min(...corners.map((c) => c.x))).toBeCloseTo(0);
        expect(Math.max(...corners.map((c) => c.x))).toBeCloseTo(o.width);
        expect(Math.min(...corners.map((c) => c.y))).toBeCloseTo(0);
        expect(Math.max(...corners.map((c) => c.y))).toBeCloseTo(o.height);
      }
    }
  });
});

describe('placement et redressement', () => {
  it('sans redressement, la couverture est celle du « cover »', () => {
    expect(coverScale(source, out, 0)).toBeCloseTo(1.2);
    expect(coverScale({ width: 1000, height: 4000 }, out, 0)).toBeCloseTo(1.08);
  });

  it('le redressement agrandit automatiquement la photo, de façon symétrique', () => {
    const scale = (straighten: number) => resolvePlacement(source, geometry({ straighten }), out).scale;
    expect(scale(5)).toBeGreaterThan(scale(0));
    expect(scale(15)).toBeGreaterThan(scale(5));
    expect(scale(-10)).toBeCloseTo(scale(10));
  });

  it('ne montre jamais de coin vide, quels que soient rotation, redressement, zoom et position', () => {
    for (const turns of TURNS) {
      for (const mirror of [false, true]) {
        const o = orientedSize(source, turns);
        for (const straighten of [-MAX_STRAIGHTEN, -7.5, 0, 3, MAX_STRAIGHTEN]) {
          for (const zoom of [1, 1.7, MAX_ZOOM]) {
            for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5], [0.15, 0.9], [-3, 4]] as const) {
              const placement = resolvePlacement(source, geometry({ turns, mirror, straighten, view: { x, y, zoom } }), out);
              for (const corner of placementCorners(placement, out)) {
                expect(corner.x).toBeGreaterThanOrEqual(-EPS);
                expect(corner.x).toBeLessThanOrEqual(o.width + EPS);
                expect(corner.y).toBeGreaterThanOrEqual(-EPS);
                expect(corner.y).toBeLessThanOrEqual(o.height + EPS);
              }
            }
          }
        }
      }
    }
  });

  it('ramène les réglages hors bornes dans leurs limites', () => {
    const g = clampGeometry(geometry({ straighten: 40, view: { x: 2, y: -1, zoom: 0.2 } }), source, out);
    expect(g.straighten).toBe(MAX_STRAIGHTEN);
    expect(g.view.zoom).toBe(1);
    expect(g.view.x).toBeLessThanOrEqual(1);
    expect(g.view.y).toBeGreaterThanOrEqual(0);
    expect(clampGeometry(geometry({ view: { x: 0.5, y: 0.5, zoom: 99 } }), source, out).view.zoom).toBe(MAX_ZOOM);
    expect(straightenGeometry(geometry(), -99, source, out).straighten).toBe(-MAX_STRAIGHTEN);
  });
});

describe('zone venue de l’aperçu', () => {
  it('un recadrage centré « cover » donne la zone par défaut', () => {
    const view = viewFromCrop(coverCrop(source, out.width / out.height), source, out);
    expect(view.x).toBeCloseTo(0.5);
    expect(view.y).toBeCloseTo(0.5);
    expect(view.zoom).toBeCloseTo(1);
    expect(viewFromCrop(undefined, source, out)).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
  });

  it('reproduit exactement le recadrage choisi dans l’aperçu', () => {
    const crop = { x: 0.2, y: 0.1, width: 0.25, height: 0.25 * (source.width / source.height) * (out.height / out.width) };
    const g = initialGeometry(crop, source, out);
    const corners = placementCorners(resolvePlacement(source, g, out), out);
    expect(corners[0]!.x).toBeCloseTo(crop.x * source.width, 3);
    expect(corners[0]!.y).toBeCloseTo(crop.y * source.height, 3);
    expect(corners[2]!.x).toBeCloseTo((crop.x + crop.width) * source.width, 3);
    expect(corners[2]!.y).toBeCloseTo((crop.y + crop.height) * source.height, 3);
  });
});

describe('quarts de tour et miroir', () => {
  it('tourne la photo affichée dans le sens demandé, avec ou sans miroir', () => {
    for (const mirror of [false, true]) {
      for (const turns of TURNS) {
        for (const direction of [1, -1] as const) {
          const before = geometry({ turns, mirror });
          const after = rotateGeometry(before, direction, source, out);
          const o = orientedSize(source, turns);
          const point = { x: 600, y: 1300 };
          const was = apply(orientationMatrix(source, turns, mirror), point.x, point.y);
          const now = apply(orientationMatrix(source, after.turns, after.mirror), point.x, point.y);
          // Quart de tour horaire de l'image affichée : (x, y) → (H − y, x) ; antihoraire : (x, y) → (y, W − x).
          const expected = direction === 1 ? { x: o.height - was.y, y: was.x } : { x: was.y, y: o.width - was.x };
          expect(now.x).toBeCloseTo(expected.x);
          expect(now.y).toBeCloseTo(expected.y);
          expect(after.mirror).toBe(mirror);
        }
      }
    }
  });

  it('le point au centre du cadre y reste, et le zoom relatif est conservé', () => {
    const point = { x: 1200, y: 800 };
    const before = geometry({ view: { x: 0.6, y: 0.55, zoom: 2.2 } });
    const m0 = orientationMatrix(source, 0, false);
    const o0 = orientedSize(source, 0);
    // On place le centre du cadre sur le point.
    const g0 = clampGeometry({ ...before, view: { ...before.view, x: apply(m0, point.x, point.y).x / o0.width, y: apply(m0, point.x, point.y).y / o0.height } }, source, out);
    const g1 = rotateGeometry(g0, 1, source, out);
    const p1 = resolvePlacement(source, g1, out);
    const c1 = apply(orientationMatrix(source, g1.turns, g1.mirror), point.x, point.y);
    expect(c1.x).toBeCloseTo(p1.cx, 3);
    expect(c1.y).toBeCloseTo(p1.cy, 3);
    expect(g1.view.zoom).toBeCloseTo(g0.view.zoom, 6);
  });

  it('quatre quarts de tour ramènent la même photo, dans le même cadre', () => {
    const start = geometry({ view: { x: 0.4, y: 0.45, zoom: 2 } });
    let g = start;
    for (let i = 0; i < 4; i++) g = rotateGeometry(g, 1, source, out);
    expect(g.turns).toBe(0);
    expect(g.view.x).toBeCloseTo(start.view.x, 6);
    expect(g.view.y).toBeCloseTo(start.view.y, 6);
    expect(g.view.zoom).toBeCloseTo(start.view.zoom, 6);
  });

  it('le miroir est un vrai reflet : zone retournée, inclinaison inversée, deux fois = identité', () => {
    const start = geometry({ straighten: 6, view: { x: 0.3, y: 0.5, zoom: 2 } });
    const mirrored = mirrorGeometry(start, source, out);
    expect(mirrored.mirror).toBe(true);
    expect(mirrored.straighten).toBe(-6);
    expect(mirrored.view.x).toBeCloseTo(0.7);
    const point = { x: 700, y: 500 };
    const was = apply(orientationMatrix(source, 0, false), point.x, point.y);
    const now = apply(orientationMatrix(source, 0, true), point.x, point.y);
    expect(now.x).toBeCloseTo(3000 - was.x);
    const back = mirrorGeometry(mirrored, source, out);
    expect(back.mirror).toBe(false);
    expect(back.straighten).toBeCloseTo(6);
    expect(back.view.x).toBeCloseTo(0.3);
    expect(mirrorGeometry(geometry(), source, out).straighten).toBe(0);
  });

  it('détecte une photo tournée, retournée ou redressée', () => {
    expect(isReoriented(undefined)).toBe(false);
    expect(isReoriented(geometry())).toBe(false);
    expect(isReoriented(geometry({ view: { x: 0.2, y: 0.8, zoom: 3 } }))).toBe(false);
    expect(isReoriented(geometry({ turns: 2 }))).toBe(true);
    expect(isReoriented(geometry({ mirror: true }))).toBe(true);
    expect(isReoriented(geometry({ straighten: -2 }))).toBe(true);
  });
});

describe('déplacer et zoomer', () => {
  it('le point sous le doigt suit le doigt, même photo redressée', () => {
    const g = geometry({ straighten: 8, view: { x: 0.5, y: 0.5, zoom: 2.5 } });
    const before = resolvePlacement(source, g, out);
    const finger = { x: out.width / 2 + 60, y: out.height / 2 - 140 };
    // Point de la photo sous le doigt avant le geste.
    const rad = (before.angle * Math.PI) / 180;
    const qx = finger.x - out.width / 2;
    const qy = finger.y - out.height / 2;
    const point = { x: before.cx + (qx * Math.cos(rad) + qy * Math.sin(rad)) / before.scale, y: before.cy + (-qx * Math.sin(rad) + qy * Math.cos(rad)) / before.scale };
    const moved = panGeometry(g, source, out, 35, -20);
    const after = toOutput(resolvePlacement(source, moved, out), point.x, point.y);
    expect(after.x).toBeCloseTo(finger.x + 35, 3);
    expect(after.y).toBeCloseTo(finger.y - 20, 3);
  });

  it('ne sort jamais de la photo, même tirée très loin', () => {
    const g = panGeometry(geometry({ view: { x: 0.5, y: 0.5, zoom: 2 } }), source, out, 1e6, -1e6);
    const corners = placementCorners(resolvePlacement(source, g, out), out);
    for (const c of corners) {
      expect(c.x).toBeGreaterThanOrEqual(-EPS);
      expect(c.y).toBeLessThanOrEqual(2000 + EPS);
    }
  });

  it('zoome autour du point choisi, dans les bornes', () => {
    const g = geometry({ straighten: -4, view: { x: 0.5, y: 0.5, zoom: 1.5 } });
    const before = resolvePlacement(source, g, out);
    const anchor = { x: 120, y: -200 };
    const rad = (before.angle * Math.PI) / 180;
    const point = {
      x: before.cx + (anchor.x * Math.cos(rad) + anchor.y * Math.sin(rad)) / before.scale,
      y: before.cy + (-anchor.x * Math.sin(rad) + anchor.y * Math.cos(rad)) / before.scale,
    };
    const zoomed = zoomGeometry(g, source, out, 1.6, anchor);
    expect(zoomed.view.zoom).toBeCloseTo(2.4);
    const after = toOutput(resolvePlacement(source, zoomed, out), point.x, point.y);
    expect(after.x).toBeCloseTo(out.width / 2 + anchor.x, 3);
    expect(after.y).toBeCloseTo(out.height / 2 + anchor.y, 3);
    expect(zoomGeometry(g, source, out, 100).view.zoom).toBe(MAX_ZOOM);
    expect(zoomGeometry(g, source, out, 0.001).view.zoom).toBe(1);
  });
});

describe('photo entière', () => {
  it('toute la photo reste visible et centrée, même inclinée', () => {
    for (const turns of TURNS) {
      for (const straighten of [-MAX_STRAIGHTEN, 0, 9]) {
        const g = geometry({ turns, straighten });
        const o = orientedSize(source, turns);
        const p = containPlacement(source, g, out);
        for (const [x, y] of [[0, 0], [o.width, 0], [o.width, o.height], [0, o.height]] as const) {
          const q = toOutput(p, x, y);
          expect(q.x).toBeGreaterThanOrEqual(-EPS);
          expect(q.x).toBeLessThanOrEqual(out.width + EPS);
          expect(q.y).toBeGreaterThanOrEqual(-EPS);
          expect(q.y).toBeLessThanOrEqual(out.height + EPS);
        }
        const center = toOutput(p, o.width / 2, o.height / 2);
        expect(center.x).toBeCloseTo(out.width / 2);
        expect(center.y).toBeCloseTo(out.height / 2);
      }
    }
  });

  it('une photo paysage tient dans la largeur d’un écran portrait', () => {
    expect(containPlacement(source, geometry(), out).scale).toBeCloseTo(1080 / 3000);
    // Tournée d'un quart de tour, elle devient plus haute que large : c'est la hauteur qui limite.
    expect(containPlacement(source, geometry({ turns: 1 }), out).scale).toBeCloseTo(Math.min(1080 / 2000, 2400 / 3000));
  });

  it('la copie agrandie couvre toute la sortie avec de la marge', () => {
    const p = backdropPlacement(source, geometry({ straighten: 12 }), out);
    expect(p.scale / coverScale(source, out, 12)).toBeCloseTo(BACKDROP_ZOOM);
    const o = orientedSize(source, 0);
    for (const c of placementCorners(p, out)) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(o.width);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(o.height);
    }
  });
});
