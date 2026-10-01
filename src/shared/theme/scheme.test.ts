import { describe, expect, it } from 'vitest';
import { ROLE_NAMES, cssVariableName, resolveScheme, schemeFromSeed, schemeFromSystemPalettes } from './scheme';

const hex = /^#[0-9a-f]{6}$/i;

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
