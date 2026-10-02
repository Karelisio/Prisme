import { useSettings } from '@/features/settings/store';
import { PrismeQuote } from '@/shared/native/quote';
import { buildQuoteConfig } from './model';
import { useQuotePrefs } from './store';

/** Dernier réglage envoyé au natif : évite de le renvoyer pour un changement sans rapport. */
let lastSent = '';

async function push() {
  const config = buildQuoteConfig(useSettings.getState().features.quote, useQuotePrefs.getState());
  const json = JSON.stringify(config);
  if (json === lastSent) return;
  lastSent = json;
  try {
    await PrismeQuote.configure(config);
  } catch {
    // Renvoyé au prochain changement ou au prochain lancement.
    lastSent = '';
  }
}

/**
 * Envoie l'option, ses réglages et la liste des phrases au natif au lancement, puis à chaque changement
 * (restauration d'une sauvegarde comprise) : il renouvelle la phrase chaque matin, app fermée.
 */
export function startQuoteSync(): () => void {
  void push();
  const unsubscribers = [
    useSettings.subscribe((s, prev) => {
      if (s.features.quote !== prev.features.quote) void push();
    }),
    useQuotePrefs.subscribe(() => void push()),
  ];
  return () => unsubscribers.forEach((u) => u());
}
