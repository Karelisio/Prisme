import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage, t, tn } from '@/shared/i18n';
import { getJson } from '@/shared/lib/http';
import type { LiveWeatherStatus } from '@/shared/native/automation';
import { STYLES, STYLE_CONTROLS, STYLE_GROUPS } from '@/features/generator/generate';
import { GEOMETRIC_SHAPES } from '@/features/generator/patterns';
import { mediaDetails } from '@/features/live/media';
import {
  GRADIENT_SPEEDS,
  MOTION_PALETTES,
  PARTICLE_BACKGROUNDS,
  PARTICLE_COLORS,
  PARTICLE_STYLES,
  WEATHER_PREVIEWS,
  formatUpdate,
  weatherCondition,
  weatherStatusText,
} from '@/features/live/motion';
import { UNLOCK_FREQUENCIES } from '@/features/live/playlist';
import { reliefStageLabel } from '@/features/live/relief';
import { MUSIC_STATUS } from '@/features/music/model';
import { COLOR_CHOICES, FONT_CHOICES, POSITION_CHOICES, QUOTE_STATUS, SIZE_CHOICES, SOURCE_CHOICES } from '@/features/quote/model';
import { PREVIEW_BACKGROUNDS } from '@/features/quote/render';
import { searchPlaces } from './geocoding';
import { HOLIDAYS } from './events';
import { BATTERY_LEVELS, DAYS, DIM_STRENGTHS, PLACE_SUGGESTIONS, SEASONS, SUN_ANCHORS, TIME_SLOTS, WEATHER_KINDS } from './model';
import { DEFAULT_ONLINE, ONLINE_THEMES, onlineThemeLabel } from './online';

vi.mock('@/shared/lib/http', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/lib/http')>()), getJson: vi.fn() }));
// Évite de charger la bibliothèque (stockage IndexedDB) pour une simple mise en forme de texte.
vi.mock('@/features/library/useImageSrc', () => ({ applyUri: (w: { full: string }) => w.full }));

afterEach(() => setLanguage('fr'));

/** Libellés gardés en français dans les données, traduits à l'affichage avec `t`. */
const LABELS: string[] = [
  ...[TIME_SLOTS, WEATHER_KINDS, SEASONS, BATTERY_LEVELS, DAYS, DIM_STRENGTHS, HOLIDAYS, ONLINE_THEMES].flatMap((list) => list.map((item) => item.label)),
  ...Object.values(SUN_ANCHORS).map((anchor) => anchor.label),
  ...PLACE_SUGGESTIONS,
  ...[MOTION_PALETTES, GRADIENT_SPEEDS, PARTICLE_STYLES, PARTICLE_BACKGROUNDS, PARTICLE_COLORS, WEATHER_PREVIEWS, UNLOCK_FREQUENCIES].flatMap((list) => list.map((item) => item.label)),
  ...[0, 1, 3, 45, 51, 61, 71, 95].flatMap((code) => [true, false].map((isDay) => weatherCondition(code, isDay).label)),
  ...[STYLE_GROUPS, STYLES, GEOMETRIC_SHAPES, SOURCE_CHOICES, FONT_CHOICES, POSITION_CHOICES, SIZE_CHOICES, COLOR_CHOICES, PREVIEW_BACKGROUNDS].flatMap((list) => list.map((item) => item.label)),
  ...Object.values(STYLE_CONTROLS).flatMap((controls) => controls.map((control) => control.label)),
  ...Object.values(QUOTE_STATUS).map((status) => status.text),
  ...Object.values(MUSIC_STATUS).map((status) => status.text),
];

/** Mots écrits pareil en français et en anglais : pas d'entrée dans la table. */
const SAME_IN_ENGLISH = new Set([
  '3', '5', '10', 'Material You', 'Pastel', 'Auto', 'Radial', 'Bauhaus', 'Terrazzo', 'Dunes', 'Triangles', 'Serif', 'Sans-serif',
  'Halloween', 'Nature', 'Minimal', 'Art', 'Architecture', 'Textures', '3D', 'Anime', 'Photo', 'Angle', 'Rotation', 'Points',
]);

describe('libellés des données : une traduction anglaise chacun', () => {
  it('rien ne reste en français', () => {
    setLanguage('en');
    const untranslated = [...new Set(LABELS)].filter((label) => t(label) === label && !SAME_IN_ENGLISH.has(label));
    expect(untranslated).toEqual([]);
  });

  it('en français, le texte d’origine', () => {
    expect([...new Set(LABELS)].filter((label) => t(label) !== label)).toEqual([]);
  });
});

describe('textes composés en anglais', () => {
  it('thème de la rotation en ligne', () => {
    setLanguage('en');
    expect(onlineThemeLabel(DEFAULT_ONLINE)).toBe('Wallpapers');
    expect(onlineThemeLabel({ ...DEFAULT_ONLINE, theme: 'foryou' })).toBe('For you');
    expect(onlineThemeLabel({ ...DEFAULT_ONLINE, theme: 'space' })).toBe('Space');
    expect(onlineThemeLabel({ ...DEFAULT_ONLINE, theme: 'custom', keyword: ' aurora ' })).toBe('“aurora”');
    expect(onlineThemeLabel({ ...DEFAULT_ONLINE, theme: 'custom' })).toBe('choose a keyword');
  });

  it('accords : un fond, des fonds, zéro fond', () => {
    setLanguage('en');
    expect(tn(1, '{count} fond', '{count} fonds')).toBe('1 wallpaper');
    expect(tn(5, '{count} fond', '{count} fonds')).toBe('5 wallpapers');
    expect(tn(0, '{count} lieu surveillé.', '{count} lieux surveillés.')).toBe('0 locations monitored.');
    expect(tn(1, 'Dossier « {name} » : {count} photo', 'Dossier « {name} » : {count} photos', { name: 'Trip' })).toBe('Folder “Trip”: 1 photo');
    expect(tn(3, '{count} fond prêt sur {total} : les images sont préparées en arrière-plan.', '{count} fonds prêts sur {total} : les images sont préparées en arrière-plan.', { total: 5 })).toBe(
      '3 of 5 wallpapers ready: images are being prepared in the background.',
    );
  });

  it('poids et description d’un fichier : unités et séparateur décimal anglais', () => {
    setLanguage('en');
    expect(mediaDetails({ name: 'Trip.mp4', sizeBytes: 48_600_000, durationMs: 15_000, width: 1080, height: 1920 })).toBe('0:15 · 46.3 MB · 1080 × 1920');
    expect(mediaDetails({ name: 'x.gif', sizeBytes: 512, width: 0, height: 0 })).toBe('512 B');
    expect(mediaDetails({ name: 'y.gif', sizeBytes: 820 * 1024, width: 0, height: 0 })).toBe('820 KB');
  });

  it('météo animée : heure du relevé, lieu et condition', () => {
    setLanguage('en');
    const now = new Date(2026, 9, 2, 16, 0);
    const lyon = { enabled: true, latitude: 45.76, longitude: 4.84, name: 'Lyon, Auvergne-Rhône-Alpes, France', preview: 'auto' as const };
    const reading = (code: number): LiveWeatherStatus => ({ code, isDay: true, precipitation: 0.4, wind: 12, latitude: 45.76, longitude: 4.84, updatedAt: new Date(2026, 9, 2, 14, 5).getTime() });
    expect(formatUpdate(new Date(2026, 9, 2, 14, 5).getTime(), now)).toBe('at 14:05');
    expect(formatUpdate(new Date(2026, 8, 30, 9, 0).getTime(), now)).toMatch(/^on 30 Sept?\.? at 09:00$/);
    expect(weatherStatusText(lyon, reading(61), now)).toBe('Rain in Lyon, updated at 14:05');
    expect(weatherStatusText({ ...lyon, name: 'Ma position' }, reading(73), now)).toBe('Snow in your location, updated at 14:05');
    expect(weatherStatusText(lyon, reading(2), now)).toBe('Cloudy in Lyon, updated at 14:05: nothing to animate in this weather.');
    expect(weatherStatusText({ ...lyon, name: undefined }, undefined, now)).toBe('Weather for this location: checked as soon as the live wallpaper is visible.');
    expect(weatherStatusText({ ...lyon, preview: 'storm' }, undefined, now)).toBe('Preview: Thunderstorm. Choose “Auto” to follow the real weather.');
  });

  it('préparation du relief', () => {
    setLanguage('en');
    expect(reliefStageLabel({ stage: 'segment' })).toBe('Cutting out the subject…');
    expect(reliefStageLabel({ stage: 'module', progress: 0.4 })).toBe('Downloading the subject cut-out module… 40%');
  });
});

describe('recherche de ville : les noms reviennent dans la langue de l’interface', () => {
  const lastUrl = () => new URL(vi.mocked(getJson).mock.calls.at(-1)?.[0] as string);

  it('anglais', async () => {
    vi.mocked(getJson).mockResolvedValue({ status: 200, data: { results: [{ name: 'London', latitude: 51.5, longitude: -0.12, country: 'United Kingdom' }] }, headers: {} });
    setLanguage('en');
    await expect(searchPlaces('Londres')).resolves.toEqual([{ name: 'London, United Kingdom', latitude: 51.5, longitude: -0.12 }]);
    expect(lastUrl().searchParams.get('language')).toBe('en');
  });

  it('français', async () => {
    vi.mocked(getJson).mockResolvedValue({ status: 200, data: { results: [] }, headers: {} });
    await searchPlaces('Londres');
    expect(lastUrl().searchParams.get('language')).toBe('fr');
  });
});
