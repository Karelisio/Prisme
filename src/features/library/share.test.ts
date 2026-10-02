import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '@/features/sources/types';
import {
  LINK_PREFIX,
  MAX_SHARED_ITEMS,
  ShareError,
  buildShare,
  decodeCollection,
  encodeCollection,
  exclusionMessage,
  extractCodes,
  parseSharedInput,
  shareMessage,
  splitShareable,
  toLink,
} from './share';

const wp = (id: string, source: Wallpaper['source'] = 'unsplash'): Wallpaper => ({
  id,
  source,
  width: 1080,
  height: 2400,
  color: '#204080',
  alt: id,
  thumb: `https://x/${id}/thumb`,
  preview: `https://x/${id}/preview`,
  full: `https://x/${id}/full`,
});

const toUrl = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('base64url');
/** Code fabriqué à la main (JSON compressé), pour les cas que `encodeCollection` ne produit jamais. */
const handmade = (value: unknown) => toUrl(deflateSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))));

const IDS = ['unsplash:mVgnbE9WqXE', 'pexels:1234567', 'wallhaven:94x38z', 'pixabay:195893', 'art:129297', 'nasa:PIA17005'];

describe('code de collection', () => {
  it('encode puis décode à l’identique, accents et emojis compris', async () => {
    const code = await encodeCollection({ name: 'Nuits d’été 🌙', ids: IDS });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    await expect(decodeCollection(code)).resolves.toEqual({ name: 'Nuits d’été 🌙', ids: IDS });
  });

  it('est de la même forme que le format documenté : JSON {v, n, i} compressé en deflate (zlib), base64url', async () => {
    const code = await encodeCollection({ name: 'Mer', ids: ['unsplash:abc'] });
    const { inflateSync } = await import('node:zlib');
    expect(JSON.parse(inflateSync(Buffer.from(code, 'base64url')).toString('utf8'))).toEqual({ v: 1, n: 'Mer', i: ['unsplash:abc'] });
    // Un code fabriqué avec le même format est lu.
    await expect(decodeCollection(handmade({ v: 1, n: 'Mer', i: ['unsplash:abc'] }))).resolves.toEqual({ name: 'Mer', ids: ['unsplash:abc'] });
  });

  it('reste compact : une quarantaine de fonds tiennent dans un QR code', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `unsplash:${Buffer.from(`${i * 7919}-photo`).toString('base64url').slice(0, 11)}`);
    const code = await encodeCollection({ name: 'Ma collection', ids });
    expect(code.length).toBeLessThan(40 * 20);
  });

  it('ne garde que des fonds retrouvables par leur identifiant, sans doublon', async () => {
    const code = await encodeCollection({
      name: '  ',
      ids: ['unsplash:a', 'unsplash:a', 'device:photo.jpg', 'creation:creation-1', 'pack:aube:2', 'inconnue:1', 'sans-source', 'pexels:7'],
    });
    await expect(decodeCollection(code)).resolves.toEqual({ name: 'Collection reçue', ids: ['unsplash:a', 'pexels:7'] });
  });

  it('limite le nom et le nombre de fonds', async () => {
    const ids = Array.from({ length: MAX_SHARED_ITEMS + 25 }, (_, i) => `pexels:${i + 1}`);
    const decoded = await decodeCollection(await encodeCollection({ name: 'x'.repeat(100), ids }));
    expect(decoded.name).toHaveLength(40);
    expect(decoded.ids).toHaveLength(MAX_SHARED_ITEMS);
  });

  it('refuse les codes abîmés ou étrangers avec un message clair', async () => {
    const invalid = 'Ce code n’est pas une collection Prisme';
    for (const bad of ['', 'abc', 'pas un code !', 'A'.repeat(40), 'eJxLTEoGAAJNASc', toUrl(Buffer.from('du texte quelconque'))]) {
      await expect(decodeCollection(bad)).rejects.toThrow(invalid);
    }
    await expect(decodeCollection(handmade('pas du json'))).rejects.toThrow(invalid);
    await expect(decodeCollection(handmade([1, 2]))).rejects.toThrow(invalid);
    await expect(decodeCollection(handmade({ n: 'sans version', i: ['pexels:1'] }))).rejects.toThrow(invalid);
    const error = await decodeCollection('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShareError);
  });

  it('refuse un code d’une version plus récente ou sans aucun fond utilisable', async () => {
    await expect(decodeCollection(handmade({ v: 2, n: 'Futur', i: ['pexels:1'] }))).rejects.toThrow('version plus récente');
    await expect(decodeCollection(handmade({ v: 1, n: 'Vide', i: [] }))).rejects.toThrow('aucun fond');
    await expect(decodeCollection(handmade({ v: 1, n: 'Locaux', i: ['device:a.jpg', 12, null] }))).rejects.toThrow('aucun fond');
  });

  it('ne se laisse pas gonfler par un code piégé', async () => {
    const bomb = handmade(`{"v":1,"n":"${'a'.repeat(200_000)}","i":["pexels:1"]}`);
    expect(bomb.length).toBeLessThan(2000);
    await expect(decodeCollection(bomb)).rejects.toThrow('Ce code n’est pas une collection Prisme');
  });
});

describe('lien, message et saisie', () => {
  it('construit le lien prisme://collection/<code>', () => {
    expect(LINK_PREFIX).toBe('prisme://collection/');
    expect(toLink('abc_-123')).toBe('prisme://collection/abc_-123');
  });

  it('le message de partage donne une phrase, le lien et le code en clair', () => {
    const text = shareMessage('Nuit', 8, 'CODE-abc_123');
    expect(text).toContain('« Nuit » (8 fonds d’écran)');
    expect(text).toContain('\nprisme://collection/CODE-abc_123\n');
    expect(text.endsWith('\nCODE-abc_123')).toBe(true);
    expect(text).toContain('Coller un code');
    expect(shareMessage('Nuit', 1, 'x')).toContain('(1 fond d’écran)');
  });

  it('retrouve le code dans un lien, un code seul ou un message entier', async () => {
    const code = await encodeCollection({ name: 'Plages', ids: IDS });
    expect(extractCodes(toLink(code))).toEqual([code]);
    expect(extractCodes(code)).toEqual([code]);
    expect(extractCodes(`Regarde ça : PRISME://collection/${code}.`)[0]).toBe(code);
    expect(extractCodes('rien de tel ici')).toEqual([]);

    const expected = { name: 'Plages', ids: IDS };
    for (const input of [toLink(code), code, `  ${code}\n`, shareMessage('Plages', IDS.length, code), `Salut ! ${shareMessage('Plages', 6, code)} Bises`]) {
      await expect(parseSharedInput(input)).resolves.toEqual({ code, collection: expected });
    }
  });

  it('signale ce qui ne va pas dans un texte collé', async () => {
    await expect(parseSharedInput('bonjour tout le monde')).rejects.toThrow('Ce code n’est pas une collection Prisme');
    await expect(parseSharedInput(toLink(handmade({ v: 9, n: 'x', i: ['pexels:1'] })))).rejects.toThrow('version plus récente');
  });
});

describe('fonds partageables', () => {
  const local = [wp('device:photo.jpg', 'device'), wp('creation:creation-1', 'creation')];
  const online = [wp('unsplash:a'), wp('pexels:1', 'pexels'), wp('nasa:PIA1', 'nasa')];

  it('sépare les fonds en ligne des images locales', () => {
    const { shareable, excluded } = splitShareable([...local, ...online]);
    expect(shareable.map((w) => w.id)).toEqual(['unsplash:a', 'pexels:1', 'nasa:PIA1']);
    expect(excluded.map((w) => w.id)).toEqual(['device:photo.jpg', 'creation:creation-1']);
  });

  it('explique ce qui est laissé de côté', () => {
    expect(exclusionMessage([])).toBeNull();
    expect(exclusionMessage(local.slice(0, 1))).toBe('1 fond n’est pas inclus : importé de la galerie ou créé dans Prisme, son image reste sur ce téléphone.');
    expect(exclusionMessage(local)).toBe('2 fonds ne sont pas inclus : importés de la galerie ou créés dans Prisme, leurs images restent sur ce téléphone.');
    expect(exclusionMessage([wp('pack:aube:2', 'pack')])).toBe('1 fond n’est pas inclus : il ne peut pas être retrouvé en ligne.');
  });

  it('prépare le partage d’une collection', async () => {
    expect(await buildShare('Que du local', local)).toBeNull();
    const build = await buildShare('Mixte', [...local, ...online]);
    expect(build?.count).toBe(3);
    expect(build?.excluded.map((w) => w.id)).toEqual(['device:photo.jpg', 'creation:creation-1']);
    expect(build?.truncated).toBe(false);
    expect(build?.link).toBe(toLink(build?.code ?? ''));
    await expect(decodeCollection(build?.code ?? '')).resolves.toEqual({ name: 'Mixte', ids: ['unsplash:a', 'pexels:1', 'nasa:PIA1'] });
  });

  it('indique quand la collection est tronquée', async () => {
    const many = Array.from({ length: MAX_SHARED_ITEMS + 5 }, (_, i) => wp(`pexels:${i + 1}`, 'pexels'));
    const build = await buildShare('Énorme', many);
    expect(build?.truncated).toBe(true);
    expect(build?.count).toBe(MAX_SHARED_ITEMS);
  });
});
