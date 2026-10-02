import { App as CapacitorApp } from '@capacitor/app';
import { useEffect, useState } from 'react';
import { isNative } from '@/shared/native';
import { type MusicStatus, PrismeMusic } from '@/shared/native/music';

const REFRESH_MS = 2_000;

/**
 * État du service d'écoute, relu toutes les quelques secondes et au retour dans l'app :
 * l'accès aux notifications s'accorde dans les réglages Android, hors de l'app.
 */
export function useMusicStatus(): MusicStatus | null {
  const [status, setStatus] = useState<MusicStatus | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void PrismeMusic.getStatus().then(
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
