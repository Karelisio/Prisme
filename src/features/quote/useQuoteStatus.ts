import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useState } from 'react';
import { isNative } from '@/shared/native';
import { PrismeQuote, type QuoteStatus } from '@/shared/native/quote';

const REFRESH_MS = 3_000;

/**
 * Fonds posés par Prisme dont l'original est gardé, relus toutes les quelques secondes et au retour dans
 * l'app : poser un fond ailleurs (ou depuis l'aperçu) change ce que la phrase peut recevoir.
 */
export function useQuoteStatus(): QuoteStatus | null {
  const [status, setStatus] = useState<QuoteStatus | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void PrismeQuote.getStatus().then(
        (next) => {
          if (active) setStatus(next);
        },
        () => undefined,
      );
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const resume = isNative ? CapacitorApp.addListener('resume', refresh) : null;
    return () => {
      active = false;
      window.clearInterval(timer);
      void resume?.then((h) => h.remove());
    };
  }, []);
  return status;
}
