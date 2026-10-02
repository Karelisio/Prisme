import type { IconName } from '@/shared/ui/icons';

export type HolidayKey = 'newyear' | 'valentine' | 'easter' | 'music' | 'bastille' | 'halloween' | 'christmas';

export interface Holiday {
  key: HolidayKey;
  label: string;
  icon: IconName;
  /** Thème cherché en ligne quand aucun fond n'est choisi. */
  query: string;
  /** Jours concernés une année donnée. */
  days: (year: number) => [number, number][];
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher) : [mois, jour]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const plusDays = (year: number, [month, day]: [number, number], n: number): [number, number] => {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return [d.getUTCMonth() + 1, d.getUTCDate()];
};

export const HOLIDAYS: readonly Holiday[] = [
  { key: 'newyear', label: 'Jour de l’an', icon: 'stars', query: 'new year fireworks', days: () => [[12, 31], [1, 1]] },
  { key: 'valentine', label: 'Saint-Valentin', icon: 'favorite', query: 'valentine hearts', days: () => [[2, 14]] },
  {
    key: 'easter',
    label: 'Pâques',
    icon: 'eco',
    query: 'easter spring flowers',
    days: (year) => {
      const sunday = easterSunday(year);
      return [sunday, plusDays(year, sunday, 1)];
    },
  },
  { key: 'music', label: 'Fête de la musique', icon: 'play', query: 'music concert lights', days: () => [[6, 21]] },
  { key: 'bastille', label: '14 Juillet', icon: 'bolt', query: 'fireworks night', days: () => [[7, 14]] },
  { key: 'halloween', label: 'Halloween', icon: 'night', query: 'halloween', days: () => [[10, 31]] },
  { key: 'christmas', label: 'Noël', icon: 'snow', query: 'christmas', days: () => [[12, 24], [12, 25]] },
];

/** Date perso (anniversaire…) : chaque année au même jour. */
export interface CustomDate {
  id: string;
  name: string;
  month: number;
  day: number;
  wallpaperId?: string;
  /** Thème cherché en ligne quand aucun fond n'est choisi. */
  keyword: string;
}

const iso = (year: number, [month, day]: [number, number]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Jours « AAAA-MM-JJ » de cette année et de la suivante (le natif n'a qu'à comparer). */
export function eventDates(days: (year: number) => [number, number][], from: Date): string[] {
  const year = from.getFullYear();
  return [year, year + 1].flatMap((y) => days(y).map((d) => iso(y, d)));
}

/** Prochaine occurrence (aujourd'hui compris) d'une liste de dates « AAAA-MM-JJ ». */
export function nextDate(dates: string[], from: Date): Date | null {
  const today = iso(from.getFullYear(), [from.getMonth() + 1, from.getDate()]);
  const next = dates.filter((d) => d >= today).sort()[0];
  if (!next) return null;
  const [y, m, d] = next.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}
