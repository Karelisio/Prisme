import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTOMATION } from '@/features/automation/model';
import { EMPTY_LIBRARY, type LibraryData } from '@/features/library/model';
import { DEFAULT_QUOTE_PREFS } from '@/features/quote/model';
import { DEFAULT_SETTINGS } from '@/features/settings/store';
import type { Wallpaper } from '@/features/sources/types';
import { BackupError, backupFileName, createBackup, mergeDiscover, mergeLibrary, parseBackup } from './backup';

const wp = (id: string, source: Wallpaper['source'] = 'unsplash'): Wallpaper => ({
  id,
  source,
  width: 1080,
  height: 2400,
  color: '#000000',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: source === 'device' ? `/data/imports/${id}.jpg` : `https://x/${id}/full`,
});

const library: LibraryData = {
  ...EMPTY_LIBRARY,
  items: { a: wp('a'), b: wp('b'), d: wp('d', 'device') },
  favorites: { a: 10, d: 11 },
  collections: [{ id: 'c1', name: 'Nuit', createdAt: 1, itemIds: ['b', 'd'] }],
  history: [
    { id: 'h2', wallpaperId: 'd', target: 'home', at: 20 },
    { id: 'h1', wallpaperId: 'b', target: 'both', at: 10, crop: { x: 0, y: 0, width: 0.5, height: 1 }, uri: '/data/creations/x.jpg' },
  ],
  offline: { a: { fullPath: '/data/offline/a' } },
};

describe('sauvegarde', () => {
  const now = new Date('2026-10-02T10:00:00Z');
  const backup = createBackup(library, { ...DEFAULT_SETTINGS, gridColumns: 3 }, DEFAULT_AUTOMATION, now, '0.2.0.31');

  it('exclut les images locales et les chemins de fichiers', () => {
    expect(Object.keys(backup.library.items).sort()).toEqual(['a', 'b']);
    expect(backup.library.favorites).toEqual({ a: 10 });
    expect(backup.library.collections[0]?.itemIds).toEqual(['b']);
    expect(backup.library.history).toEqual([{ id: 'h1', wallpaperId: 'b', target: 'both', at: 10, crop: { x: 0, y: 0, width: 0.5, height: 1 } }]);
    expect(backup).not.toHaveProperty('library.offline');
    expect(backupFileName(backup.exportedAt)).toBe('prisme-sauvegarde-2026-10-02.json');
  });

  it('ne garde que les réglages connus (pas les fonctions du store)', () => {
    const settings = { ...DEFAULT_SETTINGS, update: () => undefined } as unknown as typeof DEFAULT_SETTINGS;
    const out = createBackup(library, settings, DEFAULT_AUTOMATION, now, 'x');
    expect(out.settings).not.toHaveProperty('update');
    expect(backup.settings.gridColumns).toBe(3);
  });

  it('relit sa propre sauvegarde à l’identique', () => {
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.library).toEqual(backup.library);
    expect(parsed.settings).toEqual(backup.settings);
    expect(parsed.automation).toEqual(backup.automation);
  });

  it('refuse un fichier étranger ou trop récent, ignore les entrées abîmées', () => {
    expect(() => parseBackup('pas du json')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ format: 'autre' }))).toThrow("n'est pas une sauvegarde");
    expect(() => parseBackup(JSON.stringify({ ...backup, version: 99 }))).toThrow('plus récente');
    const damaged = {
      ...backup,
      library: {
        items: { a: wp('a'), z: { id: 'z' }, y: wp('autre-id') },
        favorites: { a: 1, z: 2, inconnu: 3, b: 'hier' },
        collections: [{ id: 'c', name: 'C', itemIds: ['a', 'z'] }, { id: 'sans-nom' }],
        history: [{ id: 'h', wallpaperId: 'a', target: 'plafond', at: 1 }, { id: 'h2', wallpaperId: 'a', target: 'lock', at: 2 }],
      },
      settings: { gridColumns: 'trois', haptics: false, sources: { pexels: false } },
    };
    const parsed = parseBackup(JSON.stringify(damaged));
    expect(Object.keys(parsed.library.items)).toEqual(['a']);
    expect(parsed.library.favorites).toEqual({ a: 1 });
    expect(parsed.library.collections).toEqual([{ id: 'c', name: 'C', createdAt: 0, itemIds: ['a'] }]);
    expect(parsed.library.history.map((h) => h.id)).toEqual(['h2']);
    expect(parsed.settings).toEqual({ haptics: false, sources: { ...DEFAULT_SETTINGS.sources, pexels: false } });
  });

  it('fusionne sans rien perdre', () => {
    const current: LibraryData = {
      ...EMPTY_LIBRARY,
      items: { a: wp('a'), e: wp('e') },
      favorites: { e: 5 },
      collections: [{ id: 'c1', name: 'Nuit (renommée)', createdAt: 1, itemIds: ['e'] }],
      history: [{ id: 'h9', wallpaperId: 'e', target: 'lock', at: 50 }],
      offline: { e: { thumbPath: '/t' } },
    };
    const merged = mergeLibrary(current, backup.library);
    expect(merged.favorites).toEqual({ a: 10, e: 5 });
    expect(merged.collections).toEqual([{ id: 'c1', name: 'Nuit (renommée)', createdAt: 1, itemIds: ['e', 'b'] }]);
    expect(merged.history.map((h) => h.id)).toEqual(['h9', 'h1']);
    expect(Object.keys(merged.items).sort()).toEqual(['a', 'b', 'e']);
    expect(merged.offline).toEqual(current.offline);
    // Restaurer deux fois ne duplique rien.
    expect(mergeLibrary(merged, backup.library)).toEqual(merged);
  });

  it('sauvegarde et fusionne abonnements et contenus masqués', () => {
    const discover = {
      following: [{ username: 'ada', name: 'Ada', url: 'https://unsplash.com/@ada' }],
      hiddenWords: ['voiture'],
      hiddenAuthors: { 'pexels:bob': { key: 'pexels:bob', name: 'Bob', source: 'pexels' as const, at: 1 } },
      hiddenIds: { 'unsplash:x': { id: 'unsplash:x', thumb: 't', alt: 'x', at: 2 } },
    };
    const withDiscover = createBackup(library, DEFAULT_SETTINGS, DEFAULT_AUTOMATION, now, '0.3.0.40', discover);
    const parsed = parseBackup(JSON.stringify(withDiscover));
    expect(parsed.discover).toEqual(discover);
    // Sauvegarde antérieure : pas de section découverte.
    expect(parseBackup(JSON.stringify(backup)).discover).toBeUndefined();
    const damaged = parseBackup(JSON.stringify({ ...withDiscover, discover: { following: [{ username: 1 }], hiddenWords: ['', 'chat'] } }));
    expect(damaged.discover).toEqual({ following: [], hiddenWords: ['chat'], hiddenAuthors: {}, hiddenIds: {} });

    const merged = mergeDiscover(
      { following: [{ username: 'ada', name: 'Ada', url: 'u' }], hiddenWords: ['Voiture'], hiddenAuthors: {}, hiddenIds: {} },
      discover,
    );
    expect(merged.following).toHaveLength(1);
    expect(merged.hiddenWords).toEqual(['Voiture']);
    expect(Object.keys(merged.hiddenAuthors)).toEqual(['pexels:bob']);
  });

  it('sauvegarde la citation du jour : réglages et citations perso, sans le cran « Une autre »', () => {
    const quotes = {
      ...DEFAULT_QUOTE_PREFS,
      target: 'both' as const,
      source: 'both' as const,
      font: 'sans' as const,
      shift: 4,
      custom: [{ id: 'q1', text: 'Carpe diem', author: 'Moi' }, { id: 'q2', text: 'Un jour à la fois' }],
    };
    const withQuotes = createBackup(library, DEFAULT_SETTINGS, DEFAULT_AUTOMATION, now, '0.5.0.1', undefined, quotes);
    expect(withQuotes.quotes).toEqual({
      target: 'both',
      source: 'both',
      font: 'sans',
      position: 'bottom',
      size: 'medium',
      color: 'auto',
      custom: [{ id: 'q1', text: 'Carpe diem', author: 'Moi' }, { id: 'q2', text: 'Un jour à la fois' }],
    });
    expect(parseBackup(JSON.stringify(withQuotes)).quotes).toEqual(withQuotes.quotes);
    // Sauvegarde antérieure : pas de section citations.
    expect(backup.quotes).toBeUndefined();
    expect(parseBackup(JSON.stringify(backup)).quotes).toBeUndefined();
  });

  it('ignore les citations et réglages abîmés', () => {
    const damaged = {
      ...backup,
      quotes: {
        target: 'plafond',
        source: 'mine',
        font: 12,
        position: 'top',
        size: 'énorme',
        shift: 9,
        custom: [{ id: 'ok', text: '  Bien   vu ' }, { id: '', text: 'sans id' }, { id: 'vide', text: '   ' }, { id: 'n', text: 3 }, 'texte'],
      },
    };
    const parsed = parseBackup(JSON.stringify(damaged));
    expect(parsed.quotes).toEqual({ source: 'mine', position: 'top', custom: [{ id: 'ok', text: 'Bien vu' }] });
    expect(parseBackup(JSON.stringify({ ...backup, quotes: 'oups' })).quotes).toBeUndefined();
  });
});
