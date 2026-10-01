import { useEffect, useState } from 'react';
import { type Capabilities, PrismeWallpaper } from '@/shared/native';

let cached: Promise<Capabilities> | null = null;

export function getCapabilities(): Promise<Capabilities> {
  cached ??= PrismeWallpaper.getCapabilities();
  return cached;
}

export function useCapabilities(): Capabilities | null {
  const [value, setValue] = useState<Capabilities | null>(null);
  useEffect(() => {
    let alive = true;
    void getCapabilities().then((c) => alive && setValue(c), () => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return value;
}
