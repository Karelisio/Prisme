import { locale, t } from '@/shared/i18n';
import type { SystemTheme } from '@/shared/native';
import type { LiveWeatherStatus } from '@/shared/native/automation';
import type { IconName } from '@/shared/ui/icons';

/*
 * Fonds animés « Dégradé » et « Particules », et météo animée du genre « Photo » : réglages envoyés à la
 * scène native (mêmes clés et mêmes valeurs par défaut que MotionPalettes.kt, GradientMotion.kt,
 * ParticlesPhysics.kt et WeatherEffects.kt), aperçu des palettes et état de la météo.
 *
 * Les libellés (palettes, vitesses, styles, météo…) restent en français dans les données : l'interface les
 * traduit à l'affichage (`t(label)`), jamais au chargement du module.
 */

export type MotionPaletteKey = 'system' | 'aurora' | 'sunset' | 'ocean' | 'forest' | 'neon' | 'pastel';

/** Base sombre et couleurs des taches ; `gain` atténue les palettes claires. */
export interface MotionPalette {
  base: string;
  colors: string[];
  gain: number;
}

/** Palettes, dans l'ordre des tuiles et du double-tap ; « Material You » suit les couleurs du système. */
export const MOTION_PALETTES: readonly { key: MotionPaletteKey; label: string; palette?: MotionPalette }[] = [
  { key: 'system', label: 'Material You' },
  { key: 'aurora', label: 'Aurore', palette: { base: '#020812', colors: ['#12d99b', '#0b9fc4', '#5a3ee6', '#1d63e0', '#b544d6'], gain: 1 } },
  { key: 'sunset', label: 'Coucher de soleil', palette: { base: '#12050f', colors: ['#ff6b3d', '#f2306a', '#ffb347', '#8e2fc9', '#ff8a9a'], gain: 1 } },
  { key: 'ocean', label: 'Océan', palette: { base: '#010c16', colors: ['#0a9fd6', '#0d5fd0', '#14c7bb', '#2a36b0', '#62d6ec'], gain: 1 } },
  { key: 'forest', label: 'Forêt', palette: { base: '#030e08', colors: ['#2a9a57', '#86bf3e', '#14694a', '#c4a94c', '#35b39b'], gain: 1 } },
  { key: 'neon', label: 'Néon', palette: { base: '#06010d', colors: ['#ff27d0', '#00dcff', '#7224ff', '#2cff86', '#ffe14d'], gain: 1 } },
  { key: 'pastel', label: 'Pastel', palette: { base: '#16131d', colors: ['#f7a8c4', '#a9dcf7', '#cdb9fb', '#bdf0cf', '#ffd9a6'], gain: 0.72 } },
];

// --- Dégradé animé ---

export type GradientSpeed = 'slow' | 'medium' | 'fast';

export type GradientSettings = {
  palette: MotionPaletteKey;
  speed: GradientSpeed;
  /** Grain léger qui évite les bandes de couleur. */
  grain: boolean;
  /** Couleur d'accent de l'app : palette « Material You » avant Android 12. */
  accent?: string;
};

export const GRADIENT_DEFAULTS: GradientSettings = { palette: 'aurora', speed: 'slow', grain: true };

export const GRADIENT_SPEEDS: readonly { value: GradientSpeed; label: string }[] = [
  { value: 'slow', label: 'Lente' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'fast', label: 'Rapide' },
];

// --- Particules ---

export type ParticleStyle = 'fireflies' | 'bubbles' | 'stars' | 'snow';
export type ParticleBackground = 'photo' | 'gradient' | 'color';

export type ParticlesSettings = {
  style: ParticleStyle;
  /** 0 (clairsemées) à 1 (nombreuses). */
  density: number;
  /** Le doigt repousse ou attire les particules. */
  touch: 'repel' | 'attract';
  background: ParticleBackground;
  /** Palette du fond « dégradé ». */
  palette: MotionPaletteKey;
  /** Fond « couleur unie ». */
  color: string;
  accent?: string;
};

export const PARTICLES_DEFAULTS: ParticlesSettings = {
  style: 'fireflies',
  density: 0.5,
  touch: 'repel',
  background: 'gradient',
  palette: 'aurora',
  color: '#0b1020',
};

export const PARTICLE_STYLES: readonly { value: ParticleStyle; label: string; icon: IconName }[] = [
  { value: 'fireflies', label: 'Lucioles', icon: 'flare' },
  { value: 'bubbles', label: 'Bulles', icon: 'bubble' },
  { value: 'stars', label: 'Étoiles', icon: 'stars' },
  { value: 'snow', label: 'Neige douce', icon: 'snow' },
];

export const PARTICLE_BACKGROUNDS: readonly { value: ParticleBackground; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'gradient', label: 'Dégradé' },
  { value: 'color', label: 'Couleur' },
];

/** Couleurs unies proposées : sombres, pour que les particules ressortent. */
export const PARTICLE_COLORS: readonly { value: string; label: string }[] = [
  { value: '#0b1020', label: 'Nuit' },
  { value: '#101418', label: 'Ardoise' },
  { value: '#1e1027', label: 'Prune' },
  { value: '#0e1a14', label: 'Sapin' },
  { value: '#000000', label: 'Noir' },
];

// --- Météo animée (genre « Photo », réglages `scenes.image.weather`) ---

export type WeatherPreview = 'auto' | 'rain' | 'snow' | 'fog' | 'storm';

export interface WeatherOverlaySettings {
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  /** Nom du lieu choisi (recherche de ville ou « Ma position »). */
  name?: string;
  /** « auto » : la météo réelle ; sinon l'effet est montré tout de suite. */
  preview: WeatherPreview;
}

export const WEATHER_OVERLAY_DEFAULTS: WeatherOverlaySettings = { enabled: false, preview: 'auto' };

export const WEATHER_PREVIEWS: readonly { value: WeatherPreview; label: string; icon: IconName }[] = [
  { value: 'auto', label: 'Auto', icon: 'autorenew' },
  { value: 'rain', label: 'Pluie', icon: 'rainy' },
  { value: 'snow', label: 'Neige', icon: 'snow' },
  { value: 'fog', label: 'Brouillard', icon: 'foggy' },
  { value: 'storm', label: 'Orage', icon: 'storm' },
];

/** Réglages de la météo animée tels qu'enregistrés (version antérieure, champ manquant) complétés. */
export function weatherOverlaySettings(stored: unknown): WeatherOverlaySettings {
  const value = (stored && typeof stored === 'object' ? stored : {}) as Partial<WeatherOverlaySettings>;
  return { ...WEATHER_OVERLAY_DEFAULTS, ...value };
}

/** Condition d'un code météo WMO (libellé en français, à traduire avec `t`), et si la couche l'anime (mêmes codes que WeatherEffects.kt). */
export function weatherCondition(code: number, isDay: boolean): { label: string; animated: boolean } {
  if (code === 0 || code === 1) return { label: isDay ? 'Ciel clair' : 'Nuit claire', animated: false };
  if (code === 45 || code === 48) return { label: 'Brouillard', animated: true };
  if (code >= 51 && code <= 57) return { label: 'Bruine', animated: true };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Pluie', animated: true };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Neige', animated: true };
  if (code >= 95 && code <= 99) return { label: 'Orage', animated: true };
  return { label: 'Nuageux', animated: false };
}

/** « Lyon, Auvergne-Rhône-Alpes, France » → « Lyon » ; sans nom : « ce lieu ». */
export function shortPlaceName(name: string | undefined): string {
  return name?.split(',')[0]?.trim() || t('ce lieu');
}

/** Même lieu, à environ 1 km près (comme le natif). */
export function samePlace(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): boolean {
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

/** « à 14:05 » le jour même, sinon « le 1 oct. à 14:05 » (« at 14:05 », « on 1 Oct at 14:05 » en anglais). */
export function formatUpdate(at: number, now: Date): string {
  const date = new Date(at);
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(date);
  if (date.toDateString() === now.toDateString()) return t('à {time}', { time });
  const day = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(date);
  return t('le {date} à {time}', { date: day, time });
}

/** État de la météo animée affiché sous le lieu (chaîne vide : rien à afficher). */
export function weatherStatusText(settings: WeatherOverlaySettings, reading: LiveWeatherStatus | undefined, now: Date): string {
  if (!settings.enabled) return '';
  if (settings.preview !== 'auto') {
    const label = WEATHER_PREVIEWS.find((p) => p.value === settings.preview)?.label ?? '';
    return t('Aperçu : {label}. Choisis « Auto » pour suivre la météo réelle.', { label: t(label) });
  }
  if (settings.latitude === undefined || settings.longitude === undefined) return t('Choisis un lieu pour suivre sa météo.');
  const place = settings.name === 'Ma position' ? t('ta position') : shortPlaceName(settings.name);
  const here = { latitude: settings.latitude, longitude: settings.longitude };
  if (!reading || !samePlace(reading, here)) return t('Météo de {place} : relevée dès que le fond animé est visible.', { place });
  const { label, animated } = weatherCondition(reading.code, reading.isDay);
  const vars = { condition: t(label), place, when: formatUpdate(reading.updatedAt, now) };
  return animated
    ? t('{condition} à {place}, mise à jour {when}', vars)
    : t('{condition} à {place}, mise à jour {when} : rien à animer par ce temps.', vars);
}

// --- Aperçu des palettes (mêmes taches et mêmes calculs que GradientMotion.kt) ---

interface Blob {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  wx: number;
  wy: number;
  px: number;
  py: number;
  radius: number;
  stretch: number;
  alpha: number;
  wr: number;
  pr: number;
}

const blob = (...v: number[]): Blob => {
  const [cx, cy, ax, ay, wx, wy, px, py, radius, stretch, alpha, wr, pr] = v as [number, number, number, number, number, number, number, number, number, number, number, number, number];
  return { cx, cy, ax, ay, wx, wy, px, py, radius, stretch, alpha, wr, pr };
};

export const BLOBS: readonly Blob[] = [
  blob(0.25, 0.2, 0.3, 0.12, 0.11, 0.073, 0, 1.7, 0.62, 2.1, 0.85, 0.051, 0.3),
  blob(0.75, 0.4, 0.28, 0.16, 0.083, 0.121, 2.1, 0.4, 0.58, 2.3, 0.8, 0.067, 1.9),
  blob(0.35, 0.66, 0.32, 0.14, 0.097, 0.059, 4, 2.9, 0.66, 2, 0.75, 0.043, 4.1),
  blob(0.65, 0.9, 0.3, 0.1, 0.071, 0.103, 1.2, 5.1, 0.56, 2.2, 0.8, 0.059, 2.6),
  blob(0.5, 0.5, 0.4, 0.32, 0.061, 0.089, 3.3, 3.8, 0.4, 1.6, 0.6, 0.077, 5.3),
];

/** Pose d'une tache au temps [t] (s) : centre (fractions de l'écran), demi-axes (fractions de la largeur), angle (rad). */
export function blobPose(b: Blob, t: number) {
  const rx = b.radius * (1 + 0.12 * Math.sin(b.wr * t + b.pr));
  return {
    x: b.cx + b.ax * Math.sin(b.wx * t + b.px),
    y: b.cy + b.ay * Math.sin(b.wy * t + b.py),
    rx,
    ry: rx * b.stretch,
    angle: 0.35 * Math.sin(b.wr * 0.7 * t + b.pr * 2),
  };
}

/** Opacité d'une tache à la distance [s] du centre (0..1) : cloche douce, nulle au bord. */
export function blobProfile(s: number): number {
  if (s >= 1) return 0;
  const edge = Math.exp(-3);
  return Math.min(1, Math.max(0, (Math.exp(-3 * s * s) - edge) / (1 - edge)));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((v) => v / 255) as [number, number, number];
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const l = (high + low) / 2;
  const d = high - low;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (high === r) h = 60 * ((((g - b) / d) % 6) + 6) % 360;
  else if (high === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return [h, Math.min(1, s), l];
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Palette tirée d'une seule couleur d'accent (comme le natif avant Android 12). */
export function paletteFromAccent(accent: string): MotionPalette {
  const [h, s0] = hexToHsl(accent);
  const s = Math.min(0.8, Math.max(0.35, s0));
  return {
    base: hslToHex(h, Math.min(s, 0.5), 0.05),
    colors: [hslToHex(h, s, 0.55), hslToHex(h + 40, s * 0.9, 0.52), hslToHex(h - 45, s * 0.85, 0.58), hslToHex(h + 10, s * 0.7, 0.72), hslToHex(h + 80, s * 0.8, 0.45)],
    gain: 1,
  };
}

function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from) ?? [0, 0, 0];
  const b = parseHex(to) ?? [0, 0, 0];
  return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** Couleurs d'une palette : « Material You » d'après les palettes du système (Android 12+), sinon l'accent de l'app. */
export function resolvePalette(key: MotionPaletteKey, system: SystemTheme | undefined, accent: string): MotionPalette {
  const preset = MOTION_PALETTES.find((p) => p.key === key)?.palette;
  if (preset) return preset;
  const p = system?.palettes;
  if (p) {
    const colors = [p.accent1?.['500'], p.accent3?.['400'], p.accent2?.['500'], p.accent1?.['300'], p.accent3?.['600']];
    const dark = p.accent1?.['900'];
    if (dark && parseHex(dark) && colors.every((c) => !!c && !!parseHex(c))) {
      return { base: mixHex('#000000', dark, 0.55), colors: colors as string[], gain: 1 };
    }
  }
  return paletteFromAccent(accent);
}

/**
 * Peint un aperçu du dégradé (petite image agrandie, taches mélangées en mode « écran ») ; [gain] atténue
 * les taches comme le fond des particules.
 */
export function paintMotionGradient(ctx: CanvasRenderingContext2D, palette: MotionPalette, width: number, height: number, time = 12, gain = 1) {
  const sw = Math.max(1, Math.ceil(width / 4));
  const sh = Math.max(1, Math.ceil(height / 4));
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const g = small.getContext('2d');
  if (!g) return;
  g.fillStyle = palette.base;
  g.fillRect(0, 0, sw, sh);
  g.globalCompositeOperation = 'screen';
  BLOBS.forEach((b, i) => {
    const pose = blobPose(b, time);
    const rgb = parseHex(palette.colors[i % palette.colors.length] ?? '#000000') ?? [0, 0, 0];
    g.save();
    g.translate(pose.x * sw, pose.y * sh);
    g.rotate(pose.angle);
    g.scale(pose.rx * sw, pose.ry * sw);
    const gradient = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let k = 0; k <= 5; k++) {
      const s = k / 5;
      gradient.addColorStop(s, `rgba(${rgb.join(',')},${blobProfile(s) * b.alpha * palette.gain * gain})`);
    }
    g.fillStyle = gradient;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, width, height);
}
