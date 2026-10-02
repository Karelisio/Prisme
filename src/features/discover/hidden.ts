import type { Wallpaper } from '@/features/sources/types';
import { normalize } from './keywords';

export interface HiddenWallpaper {
  id: string;
  thumb: string;
  alt: string;
  at: number;
}

export interface HiddenAuthor {
  key: string;
  name: string;
  source: Wallpaper['source'];
  at: number;
}

export interface Hidden {
  hiddenIds: Record<string, HiddenWallpaper>;
  hiddenAuthors: Record<string, HiddenAuthor>;
  /** Sujets masqués, tels que saisis (comparés sans accents ni majuscules). */
  hiddenWords: string[];
}

/** Identifiant d'un auteur, propre à sa source. */
export function authorKey(w: Pick<Wallpaper, 'source' | 'author'>): string | null {
  if (!w.author) return null;
  return `${w.source}:${normalize(w.author.username ?? w.author.name)}`;
}

/** La description évoque ce sujet : mot entier (pluriel en -s/-x toléré) ou expression exacte. */
export function mentions(alt: string, word: string): boolean {
  const target = normalize(word).trim();
  if (!target) return false;
  const tokens = normalize(alt).split(/[^a-z0-9]+/).filter(Boolean);
  if (target.includes(' ')) return ` ${tokens.join(' ')} `.includes(` ${target.split(/\s+/).join(' ')} `);
  return tokens.some((t) => t === target || t === `${target}s` || t === `${target}x` || `${t}s` === target);
}

export function isHidden(w: Wallpaper, hidden: Hidden): boolean {
  if (hidden.hiddenIds[w.id]) return true;
  const key = authorKey(w);
  if (key && hidden.hiddenAuthors[key]) return true;
  return hidden.hiddenWords.some((word) => mentions(w.alt, word));
}
