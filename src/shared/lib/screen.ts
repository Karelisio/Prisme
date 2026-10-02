import { useEffect, useState } from 'react';
import { PrismeWallpaper, type ScreenInfo } from '@/shared/native';

let cached: Promise<ScreenInfo> | null = null;
let known: ScreenInfo | null = null;

function fallbackScreen(): ScreenInfo {
  const density = window.devicePixelRatio || 1;
  return { width: Math.round(window.innerWidth * density), height: Math.round(window.innerHeight * density), density };
}

/** Taille physique de l'écran (en portrait), lue une seule fois auprès du plugin. */
export function getScreenInfo(): Promise<ScreenInfo> {
  cached ??= PrismeWallpaper.getScreenInfo()
    .catch(fallbackScreen)
    .then((info) => (known = info));
  return cached;
}

/** Version synchrone : la valeur lue par le plugin si elle est déjà connue, sinon une estimation. */
export function currentScreenInfo(): ScreenInfo {
  if (!known) void getScreenInfo();
  return known ?? fallbackScreen();
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
