import type { WallpaperSource } from '@/features/sources/types';
import { t } from '@/shared/i18n';
import type { WallpaperTarget } from '@/shared/native';
import type { HistoryEntry, LibraryData, Screen } from './model';

/** Ce que l'historique dit d'un fond. */
export interface Usage {
  id: string;
  /** Nombre d'applications. */
  count: number;
  /** Temps passé sur l'écran, en ms (voir `computeStats`). */
  ms: number;
  /** Dernière application. */
  lastAt: number;
}

export interface SourceUsage {
  source: WallpaperSource;
  count: number;
  ms: number;
}

export interface Stats {
  /** Applications dans l'historique. */
  total: number;
  /** Dont appliquées par un automatisme (rotation, fonds dynamiques, mode focus…). */
  auto: number;
  /** Plus ancienne application connue (ms) ; null sans historique. */
  since: number | null;
  /** Du plus appliqué au moins appliqué (à égalité : le plus longtemps affiché, puis le plus récent). */
  usage: Usage[];
  /** Par source, de la plus utilisée à la moins utilisée. */
  bySource: SourceUsage[];
}

const SCREENS: readonly Screen[] = ['home', 'lock'];
const covers = (target: WallpaperTarget, screen: Screen) => target === 'both' || target === screen;

type Interval = readonly [start: number, end: number];

/** Durée couverte par des intervalles qui peuvent se chevaucher (chaque instant compte une fois). */
export function mergedLength(intervals: readonly Interval[]): number {
  let total = 0;
  let end = Number.NEGATIVE_INFINITY;
  for (const [from, to] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }
  return total;
}

/**
 * Statistiques d'après l'historique (applications manuelles et journal des automatismes, qui
 * y sont versés). Un fond reste à l'écran de son application jusqu'à l'application suivante sur
 * le même écran (accueil ou verrouillage) ; le fond actuel de chaque écran compte jusqu'à
 * `now`. Un fond affiché sur les deux écrans en même temps ne compte qu'une fois.
 */
export function computeStats(history: readonly HistoryEntry[], items: LibraryData['items'], now: number): Stats {
  const ascending = [...history].sort((a, b) => a.at - b.at);
  const usage = new Map<string, Usage>();
  for (const entry of ascending) {
    const row = usage.get(entry.wallpaperId) ?? { id: entry.wallpaperId, count: 0, ms: 0, lastAt: 0 };
    row.count++;
    row.lastAt = Math.max(row.lastAt, entry.at);
    usage.set(entry.wallpaperId, row);
  }

  const shown = new Map<string, Interval[]>();
  for (const screen of SCREENS) {
    const entries = ascending.filter((e) => covers(e.target, screen));
    entries.forEach((entry, i) => {
      const end = Math.min(entries[i + 1]?.at ?? now, now);
      if (end <= entry.at) return;
      const list = shown.get(entry.wallpaperId) ?? [];
      list.push([entry.at, end]);
      shown.set(entry.wallpaperId, list);
    });
  }
  for (const [id, intervals] of shown) {
    const row = usage.get(id);
    if (row) row.ms = mergedLength(intervals);
  }

  const rows = [...usage.values()].sort((a, b) => b.count - a.count || b.ms - a.ms || b.lastAt - a.lastAt);
  const sources = new Map<WallpaperSource, SourceUsage>();
  for (const row of rows) {
    const source = items[row.id]?.source;
    if (!source) continue;
    const current = sources.get(source) ?? { source, count: 0, ms: 0 };
    current.count += row.count;
    current.ms += row.ms;
    sources.set(source, current);
  }

  return {
    total: ascending.length,
    auto: ascending.filter((e) => e.auto).length,
    since: ascending[0]?.at ?? null,
    usage: rows,
    bySource: [...sources.values()].sort((a, b) => b.count - a.count || b.ms - a.ms || a.source.localeCompare(b.source)),
  };
}

/** Les fonds qui sont restés le plus longtemps à l'écran. */
export function longestShown(stats: Stats, limit: number): Usage[] {
  return [...stats.usage].sort((a, b) => b.ms - a.ms || b.count - a.count).filter((u) => u.ms > 0).slice(0, limit);
}

/** Durée lisible : « 12 min », « 5 h 20 min », « 3 j 4 h ». */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t('moins d’une minute');
  if (minutes < 60) return t('{minutes} min', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? t('{hours} h', { hours }) : t('{hours} h {minutes} min', { hours, minutes: minutes % 60 });
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? t('{days} j', { days }) : t('{days} j {hours} h', { days, hours: hours % 24 });
}
