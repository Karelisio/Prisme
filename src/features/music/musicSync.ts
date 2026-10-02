import { useSettings } from '@/features/settings/store';
import { PrismeMusic } from '@/shared/native/music';
import { buildMusicConfig } from './model';
import { useMusicPrefs } from './store';

/** Dernier réglage envoyé au natif : évite de le renvoyer pour un changement sans rapport. */
let lastSent = '';

async function push() {
  const config = buildMusicConfig(useSettings.getState().features.music, useMusicPrefs.getState());
  const json = JSON.stringify(config);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeMusic.configure(config);
  } catch {
    // Renvoyé au prochain changement ou au prochain lancement.
    lastSent = '';
  }
}

/**
 * Envoie l'option, l'écran visé et le retour au fond précédent au natif au lancement, puis à chaque
 * changement (restauration d'une sauvegarde comprise) : le service d'écoute les lit app fermée.
 */
export function startMusicSync(): () => void {
  void push();
  const unsubscribers = [
    useSettings.subscribe((s, prev) => {
      if (s.features.music !== prev.features.music) void push();
    }),
    useMusicPrefs.subscribe(() => void push()),
  ];
  return () => unsubscribers.forEach((u) => u());
}
