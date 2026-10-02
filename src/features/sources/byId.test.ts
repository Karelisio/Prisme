import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getJson } from '@/shared/lib/http';
import { pexelsPhoto, unsplashPhoto } from './__fixtures__/photos';
import { fetchWallpaperById, isRetrievableId, splitId } from './byId';
import { ApiError } from './types';

vi.mock('@/shared/config/env', () => ({
  env: { unsplashKey: 'cle-unsplash', pexelsKey: 'cle-pexels', pixabayKey: 'cle-pixabay', packsUrl: '', appUtm: 'utm_source=prisme&utm_medium=referral' },
}));

vi.mock('@/shared/lib/http', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/lib/http')>()), getJson: vi.fn() }));

const get = vi.mocked(getJson);
const reply = (status: number, data: unknown = {}, headers: Record<string, string> = {}) => get.mockResolvedValueOnce({ status, data, headers });
const lastUrl = () => new URL(get.mock.calls.at(-1)?.[0] ?? 'about:blank');
const lastHeaders = () => get.mock.calls.at(-1)?.[1];

beforeEach(() => {
  get.mockReset();
});

describe('identifiants de fonds', () => {
  it('sépare la source du reste, qui peut contenir des « : »', () => {
    expect(splitId('unsplash:abc')).toEqual({ source: 'unsplash', rest: 'abc' });
    expect(splitId('pack:aube:3')).toEqual({ source: 'pack', rest: 'aube:3' });
    for (const bad of ['', 'sans-source', ':abc', 'unsplash:', 'x:\u0000', `nasa:${'a'.repeat(200)}`]) expect(splitId(bad)).toBeNull();
  });

  it('seules les sources en ligne se retrouvent par leur identifiant', () => {
    for (const id of ['unsplash:a', 'pexels:1', 'wallhaven:94x38z', 'pixabay:2', 'art:3', 'nasa:PIA1']) expect(isRetrievableId(id)).toBe(true);
    for (const id of ['device:photo.jpg', 'creation:creation-1', 'pack:aube:1', 'inconnue:1', 'sans-source']) expect(isRetrievableId(id)).toBe(false);
  });
});

describe('Unsplash par identifiant', () => {
  it('interroge /photos/:id avec la clé et normalise la photo', async () => {
    reply(200, unsplashPhoto('mVgn'));
    const w = await fetchWallpaperById('unsplash:mVgn', 360);
    expect(lastUrl().href).toBe('https://api.unsplash.com/photos/mVgn');
    expect(lastHeaders()).toMatchObject({ Authorization: 'Client-ID cle-unsplash' });
    expect(w).toMatchObject({ id: 'unsplash:mVgn', source: 'unsplash', width: 3000, height: 6000 });
    expect(w?.thumb).toContain('w=360');
    expect(w?.downloadLocation).toContain('/download');
  });

  it('photo supprimée : null ; limite de requêtes ou réseau : erreur explicite', async () => {
    reply(404, { errors: ['Not found'] });
    expect(await fetchWallpaperById('unsplash:gone', 360)).toBeNull();
    reply(403, 'Rate Limit Exceeded');
    await expect(fetchWallpaperById('unsplash:x', 360)).rejects.toMatchObject({ kind: 'rate_limit' });
    get.mockRejectedValueOnce(new (await import('@/shared/lib/http')).NetworkError(new Error('hors ligne')));
    await expect(fetchWallpaperById('unsplash:y', 360)).rejects.toMatchObject({ kind: 'network' });
    reply(200, { pas: 'une photo' });
    expect(await fetchWallpaperById('unsplash:z', 360)).toBeNull();
  });

  it('encode l’identifiant dans l’adresse', async () => {
    reply(404);
    await fetchWallpaperById('unsplash:a/b?c', 360);
    expect(lastUrl().pathname).toBe('/photos/a%2Fb%3Fc');
  });
});

describe('Pexels par identifiant', () => {
  it('interroge /v1/photos/:id', async () => {
    reply(200, pexelsPhoto(42));
    const w = await fetchWallpaperById('pexels:42', 360);
    expect(lastUrl().href).toBe('https://api.pexels.com/v1/photos/42');
    expect(lastHeaders()).toMatchObject({ Authorization: 'cle-pexels' });
    expect(w).toMatchObject({ id: 'pexels:42', color: '#A0522D' });
    reply(404);
    expect(await fetchWallpaperById('pexels:1', 360)).toBeNull();
    reply(401);
    await expect(fetchWallpaperById('pexels:2', 360)).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('Wallhaven par identifiant', () => {
  const data = {
    id: '94x38z',
    url: 'https://wallhaven.cc/w/94x38z',
    purity: 'sfw',
    dimension_x: 1440,
    dimension_y: 3200,
    colors: ['#0066cc', '#000000'],
    path: 'https://w.wallhaven.cc/full/94/wallhaven-94x38z.jpg',
    thumbs: { original: 'https://th.wallhaven.cc/orig/94/94x38z.jpg', large: 'l', small: 's' },
  };

  it('interroge /w/:id', async () => {
    reply(200, { data });
    const w = await fetchWallpaperById('wallhaven:94x38z', 360);
    expect(lastUrl().href).toBe('https://wallhaven.cc/api/v1/w/94x38z');
    expect(w).toMatchObject({ id: 'wallhaven:94x38z', color: '#0066cc', full: data.path });
  });

  it('écarte ce qui n’est pas tout public (401 sans clé, ou purity indiquée)', async () => {
    reply(401);
    expect(await fetchWallpaperById('wallhaven:nsfw', 360)).toBeNull();
    reply(200, { data: { ...data, purity: 'sketchy' } });
    expect(await fetchWallpaperById('wallhaven:94x38z', 360)).toBeNull();
    reply(404);
    expect(await fetchWallpaperById('wallhaven:gone', 360)).toBeNull();
    reply(429);
    await expect(fetchWallpaperById('wallhaven:x', 360)).rejects.toMatchObject({ kind: 'rate_limit' });
  });
});

describe('Pixabay par identifiant', () => {
  const hit = {
    id: 195893,
    pageURL: 'https://pixabay.com/photos/195893/',
    tags: 'forêt',
    webformatURL: 'https://cdn.pixabay.com/photo/x_640.jpg',
    largeImageURL: 'https://cdn.pixabay.com/photo/x_1280.jpg',
    imageWidth: 3000,
    imageHeight: 6000,
    user: 'Jean',
    user_id: 1,
  };

  it('interroge l’API avec le paramètre id', async () => {
    reply(200, { total: 1, totalHits: 1, hits: [hit] });
    const w = await fetchWallpaperById('pixabay:195893', 360);
    expect(lastUrl().searchParams.get('id')).toBe('195893');
    expect(lastUrl().searchParams.get('key')).toBe('cle-pixabay');
    expect(w).toMatchObject({ id: 'pixabay:195893', width: 640, height: 1280 });
  });

  it('image retirée : null ; clé refusée : erreur', async () => {
    reply(200, { total: 0, totalHits: 0, hits: [] });
    expect(await fetchWallpaperById('pixabay:1', 360)).toBeNull();
    reply(400, '[ERROR 400] "id" is out of valid range.');
    expect(await fetchWallpaperById('pixabay:2', 360)).toBeNull();
    reply(400, '[ERROR 400] Invalid key');
    await expect(fetchWallpaperById('pixabay:3', 360)).rejects.toBeInstanceOf(ApiError);
    // Une autre image que celle demandée ne passe pas.
    reply(200, { total: 1, totalHits: 1, hits: [hit] });
    expect(await fetchWallpaperById('pixabay:999', 360)).toBeNull();
  });
});

describe('Musée par identifiant', () => {
  const artwork = {
    id: 129297,
    title: 'Twilight in the Wilderness',
    creation_date: '1860',
    url: 'https://clevelandart.org/art/1965.233',
    creators: [{ description: 'Frederic Edwin Church (American, 1826–1900)' }],
    images: {
      web: { url: 'https://openaccess-cdn.clevelandart.org/x_web.jpg', width: '700', height: '893' },
      print: { url: 'https://openaccess-cdn.clevelandart.org/x_print.jpg', width: '2666', height: '3400' },
    },
  };

  it('interroge /artworks/:id, que l’œuvre soit enveloppée dans « data » ou non', async () => {
    reply(200, { data: artwork });
    const w = await fetchWallpaperById('art:129297', 360);
    expect(lastUrl().pathname).toBe('/api/artworks/129297');
    expect(lastUrl().searchParams.get('fields')).toContain('images');
    expect(w).toMatchObject({ id: 'art:129297', width: 2666, height: 3400 });
    reply(200, artwork);
    expect((await fetchWallpaperById('art:129297', 360))?.id).toBe('art:129297');
  });

  it('œuvre inconnue ou sans image : null', async () => {
    reply(404);
    expect(await fetchWallpaperById('art:1', 360)).toBeNull();
    reply(200, { data: { ...artwork, images: null } });
    expect(await fetchWallpaperById('art:129297', 360)).toBeNull();
    reply(200, { data: { ...artwork, id: 5 } });
    expect(await fetchWallpaperById('art:129297', 360)).toBeNull();
    reply(500);
    await expect(fetchWallpaperById('art:2', 360)).rejects.toMatchObject({ kind: 'server' });
  });
});

describe('NASA par identifiant', () => {
  const item = (id: string) => ({
    data: [{ nasa_id: id, title: 'Nébuleuse', media_type: 'image', center: 'GSFC' }],
    links: [{ href: `https://images-assets.nasa.gov/image/${id}/${id}~thumb.jpg`, rel: 'preview', render: 'image' }],
  });

  it('interroge la recherche avec nasa_id', async () => {
    reply(200, { collection: { items: [item('PIA17005')] } });
    const w = await fetchWallpaperById('nasa:PIA17005', 360);
    expect(lastUrl().searchParams.get('nasa_id')).toBe('PIA17005');
    expect(lastUrl().searchParams.get('media_type')).toBe('image');
    expect(w).toMatchObject({ id: 'nasa:PIA17005', source: 'nasa' });
  });

  it('ne prend que l’image demandée', async () => {
    reply(200, { collection: { items: [item('AUTRE')] } });
    expect(await fetchWallpaperById('nasa:PIA17005', 360)).toBeNull();
    reply(200, { collection: { items: [] } });
    expect(await fetchWallpaperById('nasa:PIA1', 360)).toBeNull();
    reply(429);
    await expect(fetchWallpaperById('nasa:PIA2', 360)).rejects.toMatchObject({ kind: 'rate_limit' });
  });
});

describe('fonds locaux', () => {
  it('ne sont jamais cherchés en ligne', async () => {
    for (const id of ['device:photo.jpg', 'creation:creation-1', 'pack:aube:1', 'sans-source']) expect(await fetchWallpaperById(id, 360)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
