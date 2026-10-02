import { useSettings } from '@/features/settings/store';
import { PrismeLive } from '@/shared/native/automation';
import { liveConfiguration, useLive } from './live';

let lastSent = '';
let timer: number | undefined;

/** Envoie genre, options et réglages de la scène au natif, seulement s'ils ont changé depuis le dernier envoi. */
async function push() {
  if (!useSettings.getState().features.live) return;
  const config = liveConfiguration();
  const json = JSON.stringify(config);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeLive.configure(config);
  } catch {
    lastSent = '';
  }
}

function schedule() {
  window.clearTimeout(timer);
  // Court délai : un curseur déplacé n'envoie que sa dernière valeur.
  timer = window.setTimeout(() => void push(), 300);
}

/** Tient le service du fond animé à jour des réglages faits dans l'app (genre, double-tap, pause éco, scène). */
export function startLiveSync(): () => void {
  const unsubscribers = [
    useLive.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.eco !== prev.eco || s.doubleTap !== prev.doubleTap || s.scenes !== prev.scenes) schedule();
    }),
    useSettings.subscribe((s, prev) => {
      if (s.features.live !== prev.features.live) schedule();
    }),
  ];
  schedule();
  return () => {
    unsubscribers.forEach((u) => u());
    window.clearTimeout(timer);
  };
}
