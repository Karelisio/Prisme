import {
  DynamicScheme,
  Hct,
  MaterialDynamicColors,
  SchemeTonalSpot,
  TonalPalette,
  Variant,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';
import type { ThemeMode } from '@/features/settings/store';
import type { SystemPaletteName, SystemTheme, TonalPalette as SystemTonalPalette } from '@/shared/native';

export const ROLE_NAMES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'inversePrimary',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'inverseSurface',
  'inverseOnSurface',
  'outline',
  'outlineVariant',
  'scrim',
  'shadow',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type ColorScheme = Record<RoleName, string>;

/** Couleur d'accent par défaut quand les couleurs dynamiques sont indisponibles ou désactivées. */
export const DEFAULT_SEED = '#6750A4';

export function schemeFromDynamic(scheme: DynamicScheme): ColorScheme {
  const out = {} as ColorScheme;
  for (const role of ROLE_NAMES) out[role] = hexFromArgb(MaterialDynamicColors[role].getArgb(scheme));
  return out;
}

/** Schéma « Tonal Spot » (style par défaut d'Android) à partir d'une couleur source. */
export function schemeFromSeed(seed: string | number, isDark: boolean): ColorScheme {
  const argb = typeof seed === 'number' ? seed : argbFromHex(seed);
  return schemeFromDynamic(new SchemeTonalSpot(Hct.fromInt(argb), isDark, 0));
}

/**
 * Reconstruit le schéma à partir des palettes système (Android 12+) : le ton 500 de chaque palette
 * donne sa teinte et sa chroma, et les rôles sont recalculés comme le fait Android.
 */
export function schemeFromSystemPalettes(
  palettes: Partial<Record<SystemPaletteName, SystemTonalPalette>>,
  isDark: boolean,
): ColorScheme | null {
  const keys = (['accent1', 'accent2', 'accent3', 'neutral1', 'neutral2'] as const).map((name) => palettes[name]?.['500']);
  if (keys.some((hex) => !hex)) return null;
  const [a1, a2, a3, n1, n2] = keys.map((hex) => argbFromHex(hex as string)) as [number, number, number, number, number];
  const scheme = new DynamicScheme({
    sourceColorHct: Hct.fromInt(a1),
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0,
    isDark,
    primaryPalette: TonalPalette.fromInt(a1),
    secondaryPalette: TonalPalette.fromInt(a2),
    tertiaryPalette: TonalPalette.fromInt(a3),
    neutralPalette: TonalPalette.fromInt(n1),
    neutralVariantPalette: TonalPalette.fromInt(n2),
  });
  return schemeFromDynamic(scheme);
}

/** Apparence demandée : sombre ou clair, et fonds noirs purs (thème « Noir », pour écrans OLED). */
export interface Appearance {
  isDark: boolean;
  black: boolean;
}

/** `systemDark` : le système (ou le navigateur) est en mode sombre ; il ne sert qu'au mode « Auto ». */
export function resolveAppearance(mode: ThemeMode, systemDark: boolean): Appearance {
  if (mode === 'black') return { isDark: true, black: true };
  return { isDark: mode === 'dark' || (mode === 'system' && systemDark), black: false };
}

/**
 * Rôles passés au noir pur : fond et surfaces de base. Les conteneurs (cartes, feuilles, barres,
 * champs) gardent les tons Material 3 du thème sombre, donc leur relief et leur teinte d'accent,
 * et restent distincts du fond ; les textes, accents et contours aussi : leurs contrastes avec le
 * noir sont supérieurs à ceux obtenus sur la surface sombre habituelle.
 */
const BLACK_ROLES = ['background', 'surface', 'surfaceDim', 'surfaceContainerLowest'] as const satisfies readonly RoleName[];

/** Dérive le thème noir d'un schéma sombre. */
export function toBlackScheme(scheme: ColorScheme): ColorScheme {
  const out = { ...scheme };
  for (const role of BLACK_ROLES) out[role] = '#000000';
  return out;
}

export interface SchemeOptions {
  system?: SystemTheme;
  dynamicColor: boolean;
  seed: string;
  isDark: boolean;
  /** Thème noir : appliqué au schéma sombre uniquement. */
  black?: boolean;
}

/** Choisit la meilleure source : rôles exacts (Android 14+), palettes système (12+), sinon couleur d'accent. */
function baseScheme({ system, dynamicColor, seed, isDark }: SchemeOptions): ColorScheme {
  if (dynamicColor && system?.palettes) {
    const base = schemeFromSystemPalettes(system.palettes, isDark);
    if (base) {
      const roles = system.roles?.[isDark ? 'dark' : 'light'];
      if (!roles) return base;
      const merged = { ...base };
      for (const role of ROLE_NAMES) {
        const value = roles[role];
        if (value) merged[role] = value;
      }
      return merged;
    }
  }
  return schemeFromSeed(seed, isDark);
}

export function resolveScheme(options: SchemeOptions): ColorScheme {
  const scheme = baseScheme(options);
  return options.black && options.isDark ? toBlackScheme(scheme) : scheme;
}

export function cssVariableName(role: RoleName): string {
  return `--md-sys-color-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export function applySchemeToDocument(
  scheme: ColorScheme,
  isDark: boolean,
  root: HTMLElement = document.documentElement,
  black = false,
) {
  for (const role of ROLE_NAMES) root.style.setProperty(cssVariableName(role), scheme[role]);
  root.style.colorScheme = isDark ? 'dark' : 'light';
  root.dataset.theme = isDark ? 'dark' : 'light';
  // Thème noir : repère pour les quelques réglages CSS propres à l'AMOLED (barre de navigation…).
  if (black) root.dataset.amoled = 'true';
  else delete root.dataset.amoled;
  // Couleur de la barre du navigateur (sans effet dans la WebView, utile en développement et en PWA).
  const doc = root.ownerDocument;
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement('meta');
    meta.name = 'theme-color';
    doc.head.append(meta);
  }
  meta.content = scheme.surface;
}
