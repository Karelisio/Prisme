import { describe, expect, it, vi } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import { schemeFromSeed } from '@/shared/theme/scheme';
import { backgroundGroups, dominantFromPixels, isLightColor } from './colors';
import { DEFAULT_FRAMING } from './framing';
import { layoutCells, photoWindow } from './layouts';
import { type DrawnPhoto, renderCollage, screenUnit } from './render';
import {
  DEFAULT_STYLE,
  EMPTY_SLOTS,
  type Slots,
  clearPhoto,
  filledCount,
  recenterAll,
  seedSlots,
  setPhoto,
  setSlotFraming,
  swapPhotos,
  usedWallpapers,
} from './slots';
import { sourceRect } from './framing';

function wallpaper(id: string): Wallpaper {
  return { id, source: 'unsplash', width: 3000, height: 6000, color: '#204080', alt: id, thumb: '', preview: '', full: '' };
}

const ids = (slots: Slots) => slots.map((s) => s?.wallpaper.id ?? null);

describe('cases du collage', () => {
  it('préremplit avec les premières photos distinctes, 4 au plus', () => {
    const list = ['a', 'b', 'a', 'c', 'd', 'e'].map(wallpaper);
    expect(ids(seedSlots(list))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(seedSlots([wallpaper('x')]))).toEqual(['x', null, null, null]);
    expect(seedSlots([])).toEqual(EMPTY_SLOTS);
  });

  it('pose, retire et échange des photos sans toucher à l’original', () => {
    const start = seedSlots(['a', 'b'].map(wallpaper));
    const withC = setPhoto(start, 2, wallpaper('c'));
    expect(ids(withC)).toEqual(['a', 'b', 'c', null]);
    expect(ids(start)).toEqual(['a', 'b', null, null]);
    expect(ids(clearPhoto(withC, 0))).toEqual([null, 'b', 'c', null]);
    expect(ids(swapPhotos(withC, 0, 2))).toEqual(['c', 'b', 'a', null]);
    // Échanger avec une case vide déplace la photo.
    expect(ids(swapPhotos(withC, 1, 3))).toEqual(['a', null, 'c', 'b']);
    expect(swapPhotos(withC, 1, 1)).toBe(withC);
  });

  it('chaque photo emporte son cadrage dans un échange ; une nouvelle photo repart du centre', () => {
    const framed = setSlotFraming(setSlotFraming(seedSlots(['a', 'b'].map(wallpaper)), 0, { zoom: 2, cx: 0.3, cy: 0.5 }), 1, { zoom: 3, cx: 0.6, cy: 0.5 });
    const swapped = swapPhotos(framed, 0, 1);
    expect(swapped[0]?.wallpaper.id).toBe('b');
    expect(swapped[0]?.framing.zoom).toBe(3);
    expect(swapped[1]?.framing.zoom).toBe(2);
    expect(setPhoto(framed, 0, wallpaper('z'))[0]?.framing).toEqual(DEFAULT_FRAMING);
    expect(setSlotFraming(framed, 3, { zoom: 2, cx: 0.5, cy: 0.5 })).toEqual(framed);
  });

  it('recentre toutes les photos', () => {
    const framed = setSlotFraming(seedSlots(['a', 'b'].map(wallpaper)), 1, { zoom: 2.5, cx: 0.2, cy: 0.4 });
    expect(recenterAll(framed).every((s) => !s || s.framing === DEFAULT_FRAMING)).toBe(true);
  });

  it('liste les photos distinctes utilisées par la disposition', () => {
    const base = seedSlots(['a', 'b', 'c', 'd'].map(wallpaper));
    expect(usedWallpapers(base, 2).map((w) => w.id)).toEqual(['a', 'b']);
    // Une photo posée dans deux cases ne compte qu'une fois ; les cases en réserve sont ignorées.
    const twice = setPhoto(base, 1, wallpaper('a'));
    expect(usedWallpapers(twice, 3).map((w) => w.id)).toEqual(['a', 'c']);
    expect(usedWallpapers(EMPTY_SLOTS, 4)).toEqual([]);
  });

  it('compte les cases remplies parmi celles de la disposition', () => {
    const slots = seedSlots(['a', 'b', 'c'].map(wallpaper));
    expect(filledCount(slots, 2)).toBe(2);
    expect(filledCount(slots, 3)).toBe(3);
    expect(filledCount(slots, 4)).toBe(3);
    expect(filledCount(clearPhoto(slots, 0), 3)).toBe(2);
  });
});

/** Pixels RGBA : `count` pixels de chaque couleur. */
function pixels(parts: [number, number, number, number][], count: number): number[] {
  return parts.flatMap((p) => Array.from({ length: count }, () => p).flat());
}

describe('couleurs de fond', () => {
  it('prend la couleur la plus présente de la photo', () => {
    const data = [...pixels([[20, 40, 200, 255]], 70), ...pixels([[220, 30, 30, 255]], 30)];
    const hex = dominantFromPixels(data);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const n = Number.parseInt((hex ?? '#000000').slice(1), 16);
    // Bleu dominant : la composante bleue l'emporte nettement sur la rouge.
    expect(n & 255).toBeGreaterThan((n >> 16) & 255);
  });

  it('ignore les pixels transparents', () => {
    const data = [...pixels([[255, 0, 0, 0]], 90), ...pixels([[10, 200, 20, 255]], 10)];
    const n = Number.parseInt((dominantFromPixels(data) ?? '#000000').slice(1), 16);
    expect((n >> 8) & 255).toBeGreaterThan(150);
    expect(dominantFromPixels(pixels([[1, 2, 3, 0]], 10))).toBeNull();
    expect(dominantFromPixels([])).toBeNull();
  });

  it('propose dominantes, Material You puis blanc et noir', () => {
    const scheme = schemeFromSeed('#6750A4', false);
    const groups = backgroundGroups(['#112233', null, '#112233', '#aabbcc'], scheme);
    expect(groups.map((g) => g.id)).toEqual(['photos', 'material', 'neutral']);
    // Doublons écartés, numérotation d'après la case de la photo.
    expect(groups[0]?.choices).toEqual([
      { color: '#112233', label: 'Couleur dominante de la photo 1' },
      { color: '#aabbcc', label: 'Couleur dominante de la photo 4' },
    ]);
    expect(groups[1]?.choices).toHaveLength(5);
    expect(groups[1]?.choices[0]?.color).toBe(scheme.primary);
    expect(groups[2]?.choices.map((c) => c.color)).toEqual(['#ffffff', '#000000']);
    const labels = groups.flatMap((g) => g.choices.map((c) => c.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('sans photo chargée ni thème, il reste blanc et noir', () => {
    expect(backgroundGroups([null, undefined]).map((g) => g.id)).toEqual(['neutral']);
  });

  it('distingue les fonds clairs des sombres', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#fdf7ff')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#1b1530')).toBe(false);
    expect(isLightColor('pas une couleur')).toBe(false);
  });
});

/** Contexte 2D factice qui garde la trace des appels. */
function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const target: Record<string, unknown> = {};
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  for (const name of ['save', 'restore', 'fillRect', 'translate', 'rotate', 'beginPath', 'moveTo', 'arcTo', 'closePath', 'clip', 'fill', 'drawImage']) {
    target[name] = vi.fn(record(name));
  }
  return { ctx: target as unknown as CanvasRenderingContext2D, calls, target };
}

describe('rendu du collage', () => {
  const source = { width: 3000, height: 6000 } as ImageBitmap;
  const photo = (framing = DEFAULT_FRAMING): DrawnPhoto => ({ source, size: { width: 3000, height: 6000 }, framing });
  const W = 540;
  const H = 1200;

  it('peint le fond puis dessine chaque photo dans sa case, comme le calcul de cadrage', () => {
    const { ctx, calls, target } = fakeContext();
    const style = { ...DEFAULT_STYLE, spacing: 8, corners: 16, background: '#336699' };
    const framed = { zoom: 2, cx: 0.4, cy: 0.5 };
    renderCollage(ctx, 'grid4', style, [photo(), photo(framed), photo(), photo()], W, H, 1);

    expect(calls[1]).toEqual({ name: 'fillRect', args: [0, 0, W, H] });
    expect(target.fillStyle).toBe('#336699');
    const draws = calls.filter((c) => c.name === 'drawImage');
    expect(draws).toHaveLength(4);

    const cells = layoutCells('grid4', W, H, { gap: 8, radius: 16 });
    cells.forEach((cell, i) => {
      const view = photoWindow(cell);
      const src = sourceRect({ width: 3000, height: 6000 }, view, i === 1 ? framed : DEFAULT_FRAMING);
      expect(draws[i]?.args).toEqual([source, src.x, src.y, src.width, src.height, view.x, view.y, view.width, view.height]);
    });
    // Chaque case est dessinée dans son propre état graphique.
    expect(calls.filter((c) => c.name === 'save').length).toBe(calls.filter((c) => c.name === 'restore').length);
  });

  it('en aperçu, une case vide apparaît en creux ; à l’export, rien', () => {
    const preview = fakeContext();
    renderCollage(preview.ctx, 'stack2', { ...DEFAULT_STYLE, background: '#000000' }, [photo(), null], W, H, 1, { placeholders: true });
    expect(preview.calls.filter((c) => c.name === 'drawImage')).toHaveLength(1);
    expect(preview.calls.filter((c) => c.name === 'fill')).toHaveLength(1);

    const exported = fakeContext();
    renderCollage(exported.ctx, 'stack2', DEFAULT_STYLE, [photo(), null], W, H, 1);
    expect(exported.calls.filter((c) => c.name === 'fill')).toHaveLength(0);
  });

  it('les polaroïds se dessinent tournés, avec leur carte et une ombre', () => {
    const { ctx, calls, target } = fakeContext();
    renderCollage(ctx, 'polaroid3', DEFAULT_STYLE, [photo(), photo(), photo()], W, H, 1);
    const rotations = calls.filter((c) => c.name === 'rotate').map((c) => c.args[0] as number);
    expect(rotations).toHaveLength(3);
    expect(rotations.every((r) => r !== 0)).toBe(true);
    // Carte blanche remplie avant la photo, puis l'ombre est remise à zéro.
    expect(calls.filter((c) => c.name === 'fill')).toHaveLength(3);
    expect(target.shadowBlur).toBe(0);
    expect(calls.filter((c) => c.name === 'drawImage')).toHaveLength(3);
  });

  it('l’espacement et les coins suivent l’échelle : aperçu et export ont les mêmes proportions', () => {
    const screen = { width: 1080, density: 2.625 };
    expect(screenUnit(1080, screen)).toBeCloseTo(2.625);
    expect(screenUnit(540, screen)).toBeCloseTo(1.3125);
    const exportDraw = fakeContext();
    const previewDraw = fakeContext();
    const style = { ...DEFAULT_STYLE, spacing: 12, corners: 0 };
    renderCollage(exportDraw.ctx, 'stack2', style, [photo(), photo()], 1080, 2400, screenUnit(1080, screen));
    renderCollage(previewDraw.ctx, 'stack2', style, [photo(), photo()], 540, 1200, screenUnit(540, screen));
    const big = exportDraw.calls.filter((c) => c.name === 'drawImage').map((c) => c.args.slice(5) as number[]);
    const small = previewDraw.calls.filter((c) => c.name === 'drawImage').map((c) => c.args.slice(5) as number[]);
    big.forEach((args, i) => args.forEach((v, j) => expect((small[i]?.[j] ?? Number.NaN) * 2).toBeCloseTo(v)));
  });
});
