/** Lever et coucher du soleil (même algorithme simplifié de la NOAA que le moteur natif). */
export interface SunTimes {
  /** Minutes depuis minuit, heure locale. */
  sunrise: number;
  sunset: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** null pendant le jour ou la nuit polaire. `utcOffsetMinutes` : décalage local de ce jour. */
export function sunTimes(latitude: number, longitude: number, day: number, utcOffsetMinutes: number): SunTimes | null {
  const g = ((2 * Math.PI) / 365) * (day - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = rad(latitude);
  const cosHa = Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = deg(Math.acos(cosHa));
  const local = (utc: number) => (((Math.round(utc + utcOffsetMinutes) % 1440) + 1440) % 1440);
  return { sunrise: local(720 - 4 * (longitude + ha) - eqTime), sunset: local(720 - 4 * (longitude - ha) - eqTime) };
}

export function sunTimesOn(date: Date, latitude: number, longitude: number): SunTimes | null {
  return sunTimes(latitude, longitude, dayOfYear(date), -date.getTimezoneOffset());
}

export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
