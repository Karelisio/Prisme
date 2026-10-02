import { locale, t } from '@/shared/i18n';

// Unités en français ; la table de traduction donne B, KB, MB, GB.
const UNITS = ['{value} Ko', '{value} Mo', '{value} Go'] as const;

/** Taille lisible, dans la langue de l'interface (o, Ko, Mo, Go en français). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return t('{value} o', { value: bytes });
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return t(UNITS[unit] ?? UNITS[0], { value: value.toLocaleString(locale(), { maximumFractionDigits: 1 }) });
}
