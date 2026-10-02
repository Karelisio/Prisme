/**
 * Choix de la phrase du jour. Le natif (QuoteSelector.kt) refait exactement les mêmes calculs, en entiers :
 * l'app et le fond d'écran affichent toujours la même phrase. Toute modification doit être reportée là-bas
 * (les mêmes valeurs d'essai sont vérifiées des deux côtés).
 */

/** Numéro du jour : jours écoulés depuis le 1er janvier 1970, calendrier grégorien. `month` va de 1 à 12. */
export function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * ((month + 9) % 12) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Numéro du jour de `date`, d'après son calendrier local (le fuseau horaire ne change rien d'autre). */
export function dayNumberOf(date: Date): number {
  return dayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** « AAAA-MM-JJ », jour local. */
export function dayKey(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Mulberry32 : générateur 32 bits, identique en Kotlin. Renvoie un entier non signé. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Le nombre d'or en entier 32 bits : sert à tirer la graine du nombre de phrases. */
const GOLDEN = 0x9e3779b1 | 0;

/**
 * Ordre de passage des `count` phrases : un mélange (Fisher-Yates) qui ne dépend que de leur nombre. Une
 * phrase ne revient donc qu'après avoir parcouru toute la liste, et jamais deux jours de suite.
 */
export function passOrder(count: number): number[] {
  const order = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  const next = mulberry32(Math.imul(count, GOLDEN));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor((next() / 4294967296) * (i + 1));
    const kept = order[i] as number;
    order[i] = order[j] as number;
    order[j] = kept;
  }
  return order;
}

/**
 * Rang de la phrase du jour dans une liste de `count` phrases. `shift` avance la suite (bouton « Une autre ») :
 * chaque cran passe à la phrase suivante, aujourd'hui comme les jours à venir, sans en répéter. -1 si la liste est vide.
 */
export function pickIndex(day: number, shift: number, count: number): number {
  if (count <= 0) return -1;
  const position = day + Math.max(0, Math.floor(shift));
  return passOrder(count)[((position % count) + count) % count] as number;
}
