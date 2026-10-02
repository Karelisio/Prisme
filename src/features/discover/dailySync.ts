import { useSettings } from '@/features/settings/store';
import { t } from '@/shared/i18n';
import { PrismeSystem } from '@/shared/native/system';

/** Dernier état envoyé au plugin : évite de reprogrammer pour un réglage sans rapport. */
let synced: { enabled: boolean; hour: number } | null = null;

function push(enabled: boolean, hour: number, prompt = false) {
  synced = { enabled, hour };
  return PrismeSystem.setDailyNotification({ enabled, hour, prompt });
}

/**
 * Active ou coupe la notification du jour depuis les réglages (avec demande d'autorisation) ;
 * renvoie le message à afficher, ou null.
 */
export async function setDailyNotification(enabled: boolean, hour = useSettings.getState().dailyHour): Promise<string | null> {
  const result = await push(enabled, hour, enabled);
  if (enabled && result.permission === 'denied') {
    await push(false, hour);
    useSettings.getState().update({ dailyNotification: false, dailyHour: hour });
    return t('Notifications refusées : autorise-les pour Prisme dans les réglages du téléphone');
  }
  useSettings.getState().update({ dailyNotification: enabled, dailyHour: hour });
  return enabled ? t('Fond du jour chaque jour à {hour} h', { hour }) : null;
}

/** Reprogramme la notification au lancement et suit les réglages (restauration d'une sauvegarde…). */
export function startDailySync(): () => void {
  const { dailyNotification, dailyHour } = useSettings.getState();
  if (dailyNotification) void push(true, dailyHour).catch(() => undefined);
  return useSettings.subscribe((s) => {
    if (synced ? synced.enabled === s.dailyNotification && synced.hour === s.dailyHour : !s.dailyNotification) return;
    void push(s.dailyNotification, s.dailyHour).catch(() => undefined);
  });
}
