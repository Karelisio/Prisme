import { describe, expect, it } from 'vitest';
import { ROLE_NAMES, type RoleName, cssVariableName, resolveAppearance, resolveScheme, schemeFromSeed, schemeFromSystemPalettes, toBlackScheme } from './scheme';

const hex = /^#[0-9a-f]{6}$/i;

/** Luminance relative et contraste selon les WCAG (la référence des rapports de Material 3). */
function relativeLuminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}

const palettes = {
  accent1: { '500': '#4a79c4' },
  accent2: { '500': '#6f7686' },
  accent3: { '500': '#89709a' },
  neutral1: { '500': '#77777a' },
  neutral2: { '500': '#74777f' },
};

describe('schémas Material You', () => {
  it('génère tous les rôles en clair et en sombre', () => {
    for (const isDark of [false, true]) {
      const scheme = schemeFromSeed('#6750A4', isDark);
      for (const role of ROLE_NAMES) expect(scheme[role]).toMatch(hex);
    }
  });

  it('respecte le contraste surface / texte selon le mode', () => {
    const light = schemeFromSeed('#6750A4', false);
    const dark = schemeFromSeed('#6750A4', true);
    expect(luminance(light.surface)).toBeGreaterThan(luminance(light.onSurface));
    expect(luminance(dark.surface)).toBeLessThan(luminance(dark.onSurface));
  });

  it('reconstruit un schéma depuis les palettes système', () => {
    const scheme = schemeFromSystemPalettes(palettes, false);
    expect(scheme).not.toBeNull();
    // Le primaire garde la teinte bleue de accent1.
    const n = Number.parseInt(scheme!.primary.slice(1), 16);
    expect(n & 255).toBeGreaterThan((n >> 16) & 255);
    expect(schemeFromSystemPalettes({ accent1: { '500': '#4a79c4' } }, false)).toBeNull();
  });

  it('privilégie les rôles exacts fournis par Android 14+', () => {
    const scheme = resolveScheme({
      system: { isDark: true, sdkInt: 34, palettes, roles: { light: {}, dark: { primary: '#123456' } } },
      dynamicColor: true,
      seed: '#6750A4',
      isDark: true,
    });
    expect(scheme.primary).toBe('#123456');
    expect(scheme.surface).toMatch(hex);
  });

  it('retombe sur la couleur d’accent sans couleurs dynamiques', () => {
    const system = { isDark: false, sdkInt: 33, palettes };
    expect(resolveScheme({ system, dynamicColor: false, seed: '#B3261E', isDark: false })).toEqual(
      schemeFromSeed('#B3261E', false),
    );
  });

  it('nomme les variables CSS en kebab-case', () => {
    expect(cssVariableName('surfaceContainerHighest')).toBe('--md-sys-color-surface-container-highest');
  });
});

const ACCENTS = ['#6750A4', '#0061A4', '#006A6A', '#386A20', '#7D5700', '#9C4146', '#8B418F', '#5C5F61'];

describe('thème noir (AMOLED)', () => {
  const black = (seed: string) => resolveScheme({ dynamicColor: false, seed, isDark: true, black: true });

  it('passe le fond et les surfaces de base au noir pur', () => {
    for (const seed of ACCENTS) {
      const scheme = black(seed);
      for (const role of ['background', 'surface', 'surfaceDim', 'surfaceContainerLowest'] as const) expect(scheme[role]).toBe('#000000');
      for (const role of ROLE_NAMES) expect(scheme[role]).toMatch(hex);
    }
  });

  it('garde des conteneurs distincts du fond, de plus en plus clairs', () => {
    const scheme = black('#6750A4');
    const ladder = ['surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest'] as const;
    ladder.slice(1).forEach((role, i) => {
      const below = scheme[ladder[i]!];
      expect(relativeLuminance(scheme[role])).toBeGreaterThan(relativeLuminance(below));
    });
    // Teinte d'accent conservée dans les conteneurs : ils sont ceux du thème sombre.
    expect(scheme.surfaceContainerHigh).toBe(schemeFromSeed('#6750A4', true).surfaceContainerHigh);
  });

  it('respecte les contrastes Material 3 : 4,5:1 pour le texte, 3:1 pour les composants', () => {
    for (const seed of ACCENTS) {
      const s = black(seed);
      const text: [RoleName, RoleName][] = [
        ['onSurface', 'surface'],
        ['onSurfaceVariant', 'surface'],
        ['onBackground', 'background'],
        ['onSurface', 'surfaceContainerHighest'],
        ['onSurfaceVariant', 'surfaceContainerHigh'],
        ['primary', 'surface'],
        ['secondary', 'surface'],
        ['tertiary', 'surface'],
        ['error', 'surface'],
        ['onPrimary', 'primary'],
        ['onSecondaryContainer', 'secondaryContainer'],
        ['onPrimaryContainer', 'primaryContainer'],
        ['onErrorContainer', 'errorContainer'],
        ['inverseOnSurface', 'inverseSurface'],
      ];
      for (const [foreground, background] of text) {
        expect(contrast(s[foreground], s[background]), `${foreground} sur ${background} (${seed})`).toBeGreaterThanOrEqual(4.5);
      }
      // Contours des champs, interrupteurs et boutons.
      expect(contrast(s.outline, s.surface), `outline (${seed})`).toBeGreaterThanOrEqual(3);
      expect(contrast(s.primary, s.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('est plus contrasté que le thème sombre habituel', () => {
    const dark = schemeFromSeed('#6750A4', true);
    const noir = black('#6750A4');
    expect(contrast(noir.onSurface, noir.surface)).toBeGreaterThan(contrast(dark.onSurface, dark.surface));
    expect(contrast(noir.primary, noir.surface)).toBeGreaterThan(contrast(dark.primary, dark.surface));
  });

  it('ne change rien aux autres thèmes', () => {
    expect(resolveScheme({ dynamicColor: false, seed: '#6750A4', isDark: false, black: true })).toEqual(schemeFromSeed('#6750A4', false));
    expect(resolveScheme({ dynamicColor: false, seed: '#6750A4', isDark: true })).toEqual(schemeFromSeed('#6750A4', true));
  });

  it('s’applique aussi aux couleurs dynamiques du système, rôles exacts compris', () => {
    const system = { isDark: true, sdkInt: 34, palettes, roles: { light: {}, dark: { primary: '#123456', surface: '#202020' } } };
    const scheme = resolveScheme({ system, dynamicColor: true, seed: '#6750A4', isDark: true, black: true });
    expect(scheme.surface).toBe('#000000');
    expect(scheme.primary).toBe('#123456');
    expect(toBlackScheme(schemeFromSeed('#B3261E', true)).background).toBe('#000000');
  });

  it('se déduit du réglage de thème', () => {
    expect(resolveAppearance('black', false)).toEqual({ isDark: true, black: true });
    expect(resolveAppearance('black', true)).toEqual({ isDark: true, black: true });
    expect(resolveAppearance('dark', false)).toEqual({ isDark: true, black: false });
    expect(resolveAppearance('light', true)).toEqual({ isDark: false, black: false });
    expect(resolveAppearance('system', true)).toEqual({ isDark: true, black: false });
    expect(resolveAppearance('system', false)).toEqual({ isDark: false, black: false });
  });
});
