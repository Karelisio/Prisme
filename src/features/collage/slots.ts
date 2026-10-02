/** État du collage : photos par case et réglages, avec des mises à jour pures et testées. */
import type { Wallpaper } from '@/features/sources/types';
import { DEFAULT_FRAMING, type Framing } from './framing';
import { MAX_PHOTOS } from './layouts';

export interface Slot {
  wallpaper: Wallpaper;
  framing: Framing;
}

/** Une entrée par case possible ; les cases au-delà de la disposition courante sont gardées en réserve. */
export type Slots = readonly (Slot | null)[];

export const EMPTY_SLOTS: Slots = Array.from({ length: MAX_PHOTOS }, () => null);

/** Premières photos distinctes d'une liste (favoris…), pour préremplir les cases. */
export function seedSlots(wallpapers: readonly Wallpaper[]): Slots {
  const seen = new Set<string>();
  const picked: Slot[] = [];
  for (const wallpaper of wallpapers) {
    if (seen.has(wallpaper.id) || picked.length >= MAX_PHOTOS) continue;
    seen.add(wallpaper.id);
    picked.push({ wallpaper, framing: DEFAULT_FRAMING });
  }
  return EMPTY_SLOTS.map((_, i) => picked[i] ?? null);
}

const replaceAt = (slots: Slots, index: number, slot: Slot | null): Slots => slots.map((s, i) => (i === index ? slot : s));

/** Met une photo dans une case ; son cadrage repart du centre. */
export function setPhoto(slots: Slots, index: number, wallpaper: Wallpaper): Slots {
  return replaceAt(slots, index, { wallpaper, framing: DEFAULT_FRAMING });
}

export function clearPhoto(slots: Slots, index: number): Slots {
  return replaceAt(slots, index, null);
}

/** Échange deux cases : chaque photo emporte son cadrage. */
export function swapPhotos(slots: Slots, a: number, b: number): Slots {
  if (a === b) return slots;
  return slots.map((s, i) => (i === a ? (slots[b] ?? null) : i === b ? (slots[a] ?? null) : s));
}

export function setSlotFraming(slots: Slots, index: number, framing: Framing): Slots {
  return slots.map((s, i) => (i === index && s ? { ...s, framing } : s));
}

/** Remet toutes les photos au centre, sans zoom. */
export function recenterAll(slots: Slots): Slots {
  return slots.map((s) => (s ? { ...s, framing: DEFAULT_FRAMING } : s));
}

/** Photos distinctes des `count` premières cases (la même photo peut occuper deux cases). */
export function usedWallpapers(slots: Slots, count: number): Wallpaper[] {
  const byId = new Map<string, Wallpaper>();
  for (const slot of slots.slice(0, count)) if (slot) byId.set(slot.wallpaper.id, slot.wallpaper);
  return [...byId.values()];
}

/** Cases remplies parmi les `count` premières. */
export function filledCount(slots: Slots, count: number): number {
  return slots.slice(0, count).filter(Boolean).length;
}

export interface CollageStyle {
  /** Espacement entre les cases et autour, en pixels de l'écran (indépendants de la résolution). */
  spacing: number;
  /** Rayon des coins, en pixels de l'écran. */
  corners: number;
  background: string;
}

export const SPACING_MAX = 24;
export const CORNERS_MAX = 40;

export const DEFAULT_STYLE: CollageStyle = { spacing: 8, corners: 16, background: '#000000' };
