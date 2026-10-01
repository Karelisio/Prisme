import { useEffect, useState } from 'react';
import { PrismeWallpaper, type ScreenInfo } from '@/shared/native';

let cached: Promise<ScreenInfo> | null = null;

/** Taille physique de l'écran (en portrait), lue une seule fois auprès du plugin. */
export function getScreenInfo(): Promise<ScreenInfo> {
  cached ??= PrismeWallpaper.getScreenInfo().catch(() => {
    const density = window.devicePixelRatio || 1;
    return { width: Math.round(window.innerWidth * density), height: Math.round(window.innerHeight * density), density };
  });
  return cached;
}

export function useScreenInfo(): ScreenInfo | null {
  const [info, setInfo] = useState<ScreenInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void getScreenInfo().then((value) => alive && setInfo(value));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** Ratio hauteur / largeur de l'écran (2,2 pour un 20:9). */
export function screenRatio(info: ScreenInfo | null): number {
  return info ? info.height / info.width : 20 / 9;
}
