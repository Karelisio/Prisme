import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { backgroundGroups } from '@/features/collage/colors';
import { buildAutoCollections } from '@/features/library/auto';
import { EMPTY_LIBRARY, createCollection } from '@/features/library/model';
import { exclusionMessage, shareMessage } from '@/features/library/share';
import { sortLabel } from '@/features/library/sort';
import { formatDuration } from '@/features/library/stats';
import { setLanguage } from '..';
import { CREATION } from './creation';

const SRC = fileURLToPath(new URL('../../..', import.meta.url));
const TABLES = join(SRC, 'shared', 'i18n');

/** Code de l'app (sans les tests ni les tables de traduction) : là où les textes français sont écrits. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === TABLES ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const code = sourceFiles(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** Le texte tel qu'il s'écrit dans le code : entre guillemets doubles, ou avec les apostrophes échappées. */
const appearsInCode = (key: string) => code.includes(key) || code.includes(key.replaceAll("'", "\\'"));

const variables = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe('traductions anglaises : bibliothèque, collage, éditeur', () => {
  const entries = Object.entries(CREATION);

  it('aucune clé morte : chaque texte français de la table figure dans le code', () => {
    expect(entries.filter(([key]) => !appearsInCode(key)).map(([key]) => key)).toEqual([]);
  });

  it('chaque traduction garde les variables {nom} du texte français', () => {
    expect(entries.filter(([key, english]) => variables(key).join() !== variables(english).join()).map(([key]) => key)).toEqual([]);
  });

  it('aucune traduction vide ni identique au français', () => {
    expect(entries.filter(([key, english]) => !english.trim() || english === key).map(([key]) => key)).toEqual([]);
  });
});

describe('textes composés en anglais', () => {
  afterEach(() => setLanguage('fr'));

  const wallpaper = (id: string, color: string, source: 'unsplash' | 'device') => ({
    id,
    source,
    width: 1080,
    height: 2400,
    color,
    alt: id,
    thumb: `https://x/${id}`,
    preview: `https://x/${id}`,
    full: `https://x/${id}`,
  });

  it('durées : jours en « d »', () => {
    setLanguage('en');
    expect(formatDuration(30_000)).toBe('less than a minute');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration((5 * 60 + 20) * 60_000)).toBe('5 h 20 min');
    expect(formatDuration((3 * 24 + 4) * 3_600_000)).toBe('3 d 4 h');
    expect(formatDuration(2 * 24 * 3_600_000)).toBe('2 d');
  });

  it('partage : fonds exclus et message', () => {
    setLanguage('en');
    expect(exclusionMessage([{ source: 'device' }])).toBe('1 wallpaper isn’t included: it was imported from the gallery or created in Prisme, so its image stays on this phone.');
    expect(exclusionMessage([{ source: 'device' }, { source: 'creation' }])).toBe(
      '2 wallpapers aren’t included: they were imported from the gallery or created in Prisme, so their images stay on this phone.',
    );
    expect(exclusionMessage([{ source: 'unsplash' }])).toBe('1 wallpaper isn’t included: it can’t be found online.');
    expect(exclusionMessage([{ source: 'unsplash' }, { source: 'device' }])).toBe('2 wallpapers aren’t included: they can’t be found online.');
    expect(exclusionMessage([])).toBeNull();
    const message = shareMessage('Escapade', 2, 'CODE');
    expect(message).toContain('I’m sharing my collection “Escapade” (2 wallpapers) with you on Prisme.');
    expect(message).toContain('Library › Collections › Paste a code.');
    expect(shareMessage('Escapade', 1, 'CODE')).toContain('(1 wallpaper)');
    // Même fonction en français : accord au pluriel dès 2.
    setLanguage('fr');
    expect(exclusionMessage([{ source: 'device' }, { source: 'device' }])).toBe(
      '2 fonds ne sont pas inclus : importés de la galerie ou créés dans Prisme, leurs images restent sur ce téléphone.',
    );
    expect(shareMessage('Escapade', 2, 'CODE')).toContain('ma collection « Escapade » (2 fonds d’écran) sur Prisme.');
  });

  it('collections automatiques, tri, collection sans nom', () => {
    setLanguage('en');
    const lib = {
      ...EMPTY_LIBRARY,
      items: { 'unsplash:a': wallpaper('unsplash:a', '#1e88e5', 'unsplash'), 'device:b': wallpaper('device:b', '#808080', 'device') },
      favorites: { 'unsplash:a': 2, 'device:b': 1 },
      history: [{ id: 'h', wallpaperId: 'unsplash:a', target: 'both' as const, at: 1 }],
    };
    const auto = buildAutoCollections(lib);
    expect(auto.map((c) => c.name)).toEqual(['Recently applied', 'Never applied', 'Blue', 'Phone gallery', 'Unsplash']);
    expect(auto.map((c) => c.hint)).toEqual(['The last 30 wallpapers applied', 'Favorites and collections not in your history', 'Dominant color', 'Source', 'Source']);
    expect(sortLabel('color')).toBe('Color');
    expect(createCollection(EMPTY_LIBRARY, 'c', '  ', 1).collections[0]?.name).toBe('Untitled');
    setLanguage('fr');
    expect(buildAutoCollections(lib).map((c) => c.name)).toEqual(['Récemment appliqués', 'Jamais appliqués', 'Bleus', 'Galerie du téléphone', 'Unsplash']);
    expect(createCollection(EMPTY_LIBRARY, 'c', '  ', 1).collections[0]?.name).toBe('Sans titre');
  });

  it('couleurs de fond du collage', () => {
    setLanguage('en');
    const labels = backgroundGroups(['#112233', null, '#112233', '#445566']).flatMap((group) => group.choices.map((choice) => choice.label));
    expect(labels).toEqual(['Dominant color of photo 1', 'Dominant color of photo 4', 'White', 'Black']);
  });
});
