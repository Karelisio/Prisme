import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { openPreview, useNavigation } from '@/app/navigation';
import { queryClient } from '@/app/queryClient';
import { thumbWidthFor } from '@/features/browse/useFeed';
import { useSettings } from '@/features/settings/store';
import { usableSources } from '@/features/sources/registry';
import type { Wallpaper } from '@/features/sources/types';
import { showSnackbar } from '@/shared/ui/overlays';
import { dayKey, loadDaily } from './daily';
import { useDiscover } from './store';

const dailyQuery = (day: string) => ({
  queryKey: ['daily', day],
  queryFn: () => loadDaily(day, usableSources(useSettings.getState().sources), thumbWidthFor(2, false)),
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

/** Fond du jour (mémorisé pour la journée) ; null tant qu'il charge ou si aucune source ne répond. */
export function useDaily(): { wallpaper: Wallpaper | null; loading: boolean } {
  const day = dayKey();
  const saved = useDiscover((s) => (s.daily?.day === day ? s.daily.wallpaper : null));
  const sources = useSettings((s) => s.sources);
  const key = useMemo(() => JSON.stringify(usableSources(sources)), [sources]);
  const query = useQuery({ ...dailyQuery(day), queryKey: ['daily', day, key], enabled: !saved });
  return { wallpaper: saved ?? query.data ?? null, loading: !saved && query.isPending };
}

/** Notification « Fond du jour » touchée : ouvre l'aperçu du fond du jour. */
export async function openDaily(): Promise<void> {
  const day = dayKey();
  try {
    const wallpaper = await queryClient.fetchQuery(dailyQuery(day));
    if (!wallpaper) {
      showSnackbar('Fond du jour indisponible pour le moment');
      return;
    }
    const top = useNavigation.getState().overlays.at(-1);
    if (top?.type === 'preview' && top.wallpaper.id === wallpaper.id) return;
    openPreview(wallpaper);
  } catch {
    showSnackbar('Fond du jour indisponible : vérifie ta connexion');
  }
}
