import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useSettings } from '@/features/settings/store';
import { PrismeSystem } from '@/shared/native/system';
import { showSnackbar } from '@/shared/ui/overlays';
import { CHECK_INTERVAL_MS, type ReleaseInfo, fetchLatestRelease } from './updates';

interface UpdateState {
  lastCheckedAt: number;
  /** Release plus récente que l'app installée, s'il y en a une. */
  available: ReleaseInfo | null;
  /** Build ignoré avec « Plus tard » : plus de rappel automatique pour lui. */
  dismissedBuild: number | null;
  checking: boolean;
  sheetOpen: boolean;
}

export const useUpdates = create<UpdateState>()(
  persist(
    (): UpdateState => ({ lastCheckedAt: 0, available: null, dismissedBuild: null, checking: false, sheetOpen: false }),
    {
      name: 'prisme-updates',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ lastCheckedAt, available, dismissedBuild }) => ({ lastCheckedAt, available, dismissedBuild }),
    },
  ),
);

export const openUpdateSheet = () => useUpdates.setState({ sheetOpen: true });
export const closeUpdateSheet = () => useUpdates.setState({ sheetOpen: false });

export function dismissUpdate() {
  const available = useUpdates.getState().available;
  useUpdates.setState({ sheetOpen: false, dismissedBuild: available?.build ?? null });
}

export type CheckResult = 'available' | 'up-to-date' | 'error';

export async function checkForUpdate(): Promise<CheckResult> {
  if (useUpdates.getState().checking) return 'error';
  useUpdates.setState({ checking: true });
  try {
    const [info, release] = await Promise.all([PrismeSystem.getAppInfo(), fetchLatestRelease()]);
    const available = release && release.build > info.versionCode ? release : null;
    useUpdates.setState({ available, lastCheckedAt: Date.now() });
    return available ? 'available' : 'up-to-date';
  } catch {
    return 'error';
  } finally {
    useUpdates.setState({ checking: false });
  }
}

/** Vérification en arrière-plan peu après le démarrage (au plus toutes les 6 h). */
export function startUpdateCheck(delayMs = 4000): () => void {
  const timer = window.setTimeout(async () => {
    if (!useSettings.getState().autoUpdateCheck) return;
    const state = useUpdates.getState();
    if (Date.now() - state.lastCheckedAt >= CHECK_INTERVAL_MS) await checkForUpdate();
    else if (state.available) {
      // Release mémorisée : toujours plus récente que l'app ? (elle a pu être installée depuis)
      const info = await PrismeSystem.getAppInfo().catch(() => null);
      if (info && state.available.build <= info.versionCode) useUpdates.setState({ available: null });
    }
    const { available, dismissedBuild, sheetOpen } = useUpdates.getState();
    if (available && available.build !== dismissedBuild && !sheetOpen) {
      showSnackbar(`Prisme ${available.version} est disponible`, { label: 'Voir', onAction: openUpdateSheet });
    }
  }, delayMs);
  return () => window.clearTimeout(timer);
}
