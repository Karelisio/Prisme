import { describe, expect, it } from 'vitest';
import type { SystemTheme } from '@/shared/native';
import type { LiveWeatherStatus } from '@/shared/native/automation';
import {
  BLOBS,
  GRADIENT_DEFAULTS,
  MOTION_PALETTES,
  PARTICLES_DEFAULTS,
  PARTICLE_STYLES,
  WEATHER_OVERLAY_DEFAULTS,
  WEATHER_PREVIEWS,
  blobPose,
  blobProfile,
  formatUpdate,
  hexToHsl,
  hslToHex,
  paletteFromAccent,
  resolvePalette,
  shortPlaceName,
  weatherCondition,
  weatherOverlaySettings,
  weatherStatusText,
} from './motion';

const lyon = { enabled: true, latitude: 45.76, longitude: 4.84, name: 'Lyon, Auvergne-Rhône-Alpes, France', preview: 'auto' as const };
const now = new Date(2026, 9, 2, 16, 30);
const reading = (code: number, patch: Partial<LiveWeatherStatus> = {}): LiveWeatherStatus => ({
  code,
  isDay: true,
  precipitation: 0.4,
  wind: 12,
  latitude: 45.76,
  longitude: 4.84,
  updatedAt: new Date(2026, 9, 2, 14, 5).getTime(),
  ...patch,
});

describe('fonds animés : réglages par défaut (mêmes que la scène native)', () => {
  it('dégradé : palette Aurore, lent, avec grain', () => {
    expect(GRADIENT_DEFAULTS).toEqual({ palette: 'aurora', speed: 'slow', grain: true });
  });

  it('particules : lucioles, densité moyenne, le doigt repousse, fond dégradé', () => {
    expect(PARTICLES_DEFAULTS).toEqual({ style: 'fireflies', density: 0.5, touch: 'repel', background: 'gradient', palette: 'aurora', color: '#0b1020' });
    expect(PARTICLE_STYLES.map((s) => s.value)).toEqual(['fireflies', 'bubbles', 'stars', 'snow']);
  });

  it('palettes dans l’ordre du double-tap, Material You en premier', () => {
    expect(MOTION_PALETTES.map((p) => p.key)).toEqual(['system', 'aurora', 'sunset', 'ocean', 'forest', 'neon', 'pastel']);
    for (const p of MOTION_PALETTES.slice(1)) expect(p.palette?.colors).toHaveLength(5);
  });

  it('météo animée : désactivée, aperçu automatique ; réglages anciens complétés', () => {
    expect(WEATHER_OVERLAY_DEFAULTS).toEqual({ enabled: false, preview: 'auto' });
    expect(WEATHER_PREVIEWS.map((p) => p.value)).toEqual(['auto', 'rain', 'snow', 'fog', 'storm']);
    expect(weatherOverlaySettings(undefined)).toEqual(WEATHER_OVERLAY_DEFAULTS);
    expect(weatherOverlaySettings({ enabled: true, latitude: 1, longitude: 2 })).toEqual({ enabled: true, latitude: 1, longitude: 2, preview: 'auto' });
  });
});

describe('météo animée : état affiché', () => {
  it('codes météo : libellé, et si la couche anime quelque chose', () => {
    expect(weatherCondition(0, true)).toEqual({ label: 'Ciel clair', animated: false });
    expect(weatherCondition(1, false)).toEqual({ label: 'Nuit claire', animated: false });
    expect(weatherCondition(3, true)).toEqual({ label: 'Nuageux', animated: false });
    expect(weatherCondition(48, true)).toEqual({ label: 'Brouillard', animated: true });
    expect(weatherCondition(53, true).label).toBe('Bruine');
    expect(weatherCondition(81, true).label).toBe('Pluie');
    expect(weatherCondition(86, true).label).toBe('Neige');
    expect(weatherCondition(99, true).label).toBe('Orage');
    expect(weatherCondition(20, true)).toEqual({ label: 'Nuageux', animated: false });
  });

  it('nom court du lieu et heure du relevé', () => {
    expect(shortPlaceName('Lyon, Auvergne-Rhône-Alpes, France')).toBe('Lyon');
    expect(shortPlaceName(undefined)).toBe('ce lieu');
    expect(formatUpdate(new Date(2026, 9, 2, 14, 5).getTime(), now)).toBe('à 14:05');
    expect(formatUpdate(new Date(2026, 8, 30, 9, 0).getTime(), now)).toBe('le 30 sept. à 09:00');
  });

  it('pluie à Lyon, mise à jour à 14:05', () => {
    expect(weatherStatusText(lyon, reading(61), now)).toBe('Pluie à Lyon, mise à jour à 14:05');
    expect(weatherStatusText({ ...lyon, name: 'Ma position' }, reading(73), now)).toBe('Neige à ta position, mise à jour à 14:05');
    expect(weatherStatusText(lyon, reading(2), now)).toBe('Nuageux à Lyon, mise à jour à 14:05 : rien à animer par ce temps.');
  });

  it('relevé d’un autre lieu, pas de lieu, aperçu, option coupée', () => {
    expect(weatherStatusText(lyon, reading(61, { latitude: 48.85, longitude: 2.35 }), now)).toBe(
      'Météo de Lyon : relevée dès que le fond animé est visible.',
    );
    expect(weatherStatusText(lyon, undefined, now)).toBe('Météo de Lyon : relevée dès que le fond animé est visible.');
    expect(weatherStatusText({ enabled: true, preview: 'auto' }, reading(61), now)).toBe('Choisis un lieu pour suivre sa météo.');
    expect(weatherStatusText({ ...lyon, preview: 'storm' }, reading(61), now)).toBe('Aperçu : Orage. Choisis « Auto » pour suivre la météo réelle.');
    expect(weatherStatusText({ ...lyon, enabled: false }, reading(61), now)).toBe('');
  });
});

describe('aperçu des palettes', () => {
  it('teinte, saturation, luminosité : aller-retour', () => {
    for (const hex of ['#6750a4', '#12d99b', '#ff6b3d', '#808080', '#0b1020']) {
      const [h, s, l] = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
  });

  it('Material You : palettes du système (Android 12+), sinon couleur d’accent de l’app', () => {
    const tones = (base: string) => ({ '300': base, '400': base, '500': base, '600': base, '900': '#21005d' });
    const system = { isDark: true, sdkInt: 34, palettes: { accent1: tones('#7f67be'), accent2: tones('#7a7289'), accent3: tones('#b4738a'), neutral1: {}, neutral2: {} } } as SystemTheme;
    const fromSystem = resolvePalette('system', system, '#6750a4');
    expect(fromSystem.colors).toEqual(['#7f67be', '#b4738a', '#7a7289', '#7f67be', '#b4738a']);
    expect(fromSystem.base).toBe('#120033');
    const fromAccent = resolvePalette('system', undefined, '#6750a4');
    expect(fromAccent).toEqual(paletteFromAccent('#6750a4'));
    expect(Math.abs(hexToHsl(fromAccent.colors[0] as string)[0] - hexToHsl('#6750a4')[0])).toBeLessThan(3);
    expect(hexToHsl(fromAccent.base)[2]).toBeLessThan(0.08);
    expect(resolvePalette('ocean', system, '#6750a4').base).toBe('#010c16');
  });

  it('taches : mouvement doux qui reste autour de l’écran, profil en cloche', () => {
    for (const b of BLOBS) {
      for (let t = 0; t < 600; t += 7.3) {
        const pose = blobPose(b, t);
        expect(pose.x).toBeGreaterThan(-0.2);
        expect(pose.x).toBeLessThan(1.2);
        expect(pose.y).toBeGreaterThan(-0.2);
        expect(pose.y).toBeLessThan(1.2);
        expect(pose.ry).toBeGreaterThanOrEqual(pose.rx);
      }
    }
    expect(blobProfile(0)).toBe(1);
    expect(blobProfile(1)).toBe(0);
    expect(blobProfile(0.5)).toBeGreaterThan(blobProfile(0.7));
  });
});
