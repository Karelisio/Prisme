import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useSettings } from '@/features/settings/store';
import { PrismeWallpaper, type SystemTheme, isNative } from '@/shared/native';
import { type ColorScheme, applySchemeToDocument, resolveAppearance, resolveScheme } from './scheme';

interface ThemeState {
  system?: SystemTheme;
  isDark: boolean;
  /** Thème noir (fonds noirs purs) : toujours accompagné de `isDark`. */
  black: boolean;
  /** Schéma appliqué à l'interface (sert aussi de palette au générateur). */
  scheme?: ColorScheme;
  /** Style imposé aux barres système par un écran plein cadre (aperçu sur fond d'image). */
  barsOverride: 'light-content' | 'dark-content' | null;
  setBarsOverride: (value: ThemeState['barsOverride']) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  isDark: false,
  black: false,
  barsOverride: null,
  setBarsOverride: (barsOverride) => set({ barsOverride }),
}));

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** Calcule le schéma Material You et l'applique aux variables CSS et aux barres système. */
export function ThemeController() {
  const themeMode = useSettings((s) => s.themeMode);
  const dynamicColor = useSettings((s) => s.dynamicColor);
  const seedColor = useSettings((s) => s.seedColor);
  const barsOverride = useTheme((s) => s.barsOverride);
  const [system, setSystem] = useState<SystemTheme>();
  const [mediaDark, setMediaDark] = useState(() => darkQuery?.matches ?? false);

  useEffect(() => {
    void PrismeWallpaper.getSystemTheme().then(setSystem, () => undefined);
    const handle = PrismeWallpaper.addListener('systemThemeChanged', setSystem);
    const onMedia = (e: MediaQueryListEvent) => setMediaDark(e.matches);
    darkQuery?.addEventListener('change', onMedia);
    return () => {
      void handle.then((h) => h.remove());
      darkQuery?.removeEventListener('change', onMedia);
    };
  }, []);

  const { isDark, black } = resolveAppearance(themeMode, system?.isDark ?? mediaDark);
  const scheme = useMemo(
    () => resolveScheme({ system, dynamicColor, seed: seedColor, isDark, black }),
    [system, dynamicColor, seedColor, isDark, black],
  );

  useLayoutEffect(() => {
    applySchemeToDocument(scheme, isDark, document.documentElement, black);
    useTheme.setState({ system, isDark, black, scheme });
  }, [scheme, isDark, black, system]);

  useEffect(() => {
    if (!isNative) return;
    const lightContent = barsOverride ? barsOverride === 'light-content' : isDark;
    void SystemBars.setStyle({ style: lightContent ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }, [isDark, barsOverride]);

  return null;
}
