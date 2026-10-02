import type { Wallpaper } from '@/features/sources/types';

/**
 * Mots ignorés pour deviner le sujet d'un fond : mots vides (français, anglais), positions,
 * couleurs (traitées à part) et termes génériques des descriptions automatiques.
 */
const STOPWORDS = new Set(
  `a an and are as at be by for from has have in into is it its of on or that the this to was were with without while
  above across after against along among around behind below beside between beyond close down during front inside near
  next off onto out outside over through top under underneath up upon middle side bottom left right background foreground
  view views shows showing seen taken looking sitting standing lying walking holding covered filled full lots many some
  very two three one image images photo photos photograph picture pictures wallpaper wallpapers stock free hd
  black white red blue green yellow orange purple pink brown gray grey colorful colored dark light bright
  le la les un une des du de d l au aux et ou en dans sur sous avec sans pour par entre vers chez est sont qui que
  noir noire noirs blanc blanche blancs rouge bleu bleue vert verte jaune rose violet gris marron sombre clair claire
  fond fonds ecran photographie image`.split(/\s+/),
);

/** Minuscules sans accents : « Forêt » et « foret » se confondent. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Mots significatifs d'un texte, dans l'ordre, sans doublon. */
export function words(text: string): string[] {
  const out: string[] = [];
  for (const token of normalize(text).split(/[^a-z0-9]+/)) {
    if (token.length < 3 || /^\d+$/.test(token) || STOPWORDS.has(token) || out.includes(token)) continue;
    out.push(token);
  }
  return out;
}

/** Les descriptions de ces sources ne disent rien du sujet (identifiant, nom de fichier…). */
const NO_SUBJECT = new Set<Wallpaper['source']>(['wallhaven', 'device', 'creation', 'pack']);

/** Sujet probable d'un fond, d'après sa description. */
export function keywordsOf(w: Pick<Wallpaper, 'source' | 'alt'>, limit = 3): string[] {
  if (NO_SUBJECT.has(w.source)) return [];
  return words(w.alt).slice(0, limit);
}

/** Mots les plus fréquents d'une liste de textes (chaque texte compte une fois par mot). */
export function topWords(texts: string[][], limit: number, minCount = 1): string[] {
  const counts = new Map<string, number>();
  for (const list of texts) for (const word of new Set(list)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}
