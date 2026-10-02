import { describe, expect, it } from 'vitest';
import { pexelsPhoto, unsplashPhoto } from './__fixtures__/photos';
import { mapArtwork } from './art';
import { fitsWallpaper } from './filters';
import { mapNasa } from './nasa';
import { mapPexels } from './pexels';
import { largeSize, mapPixabay } from './pixabay';
import { mapUnsplash, unsplashError, withUtm } from './unsplash';
import { mapWallhaven } from './wallhaven';

describe('Unsplash', () => {
  it('normalise une photo avec miniature basse résolution et attribution', () => {
    const w = mapUnsplash(unsplashPhoto('abc'), 360);
    expect(w.id).toBe('unsplash:abc');
    expect(w.thumb).toContain('w=360');
    expect(w.thumb).toContain('h=640');
    expect(w.thumb).toContain('q=60');
    expect(w.preview).toContain('w=1080');
    expect(w.full).toContain('fm=jpg');
    expect(w.full).toContain('w=3000');
    expect(w.author).toEqual({ name: 'Ada Lovelace', url: 'https://unsplash.com/@ada?utm_source=prisme&utm_medium=referral', username: 'ada' });
    expect(w.downloadLocation).toContain('/download');
  });

  it('limite la résolution appliquée', () => {
    expect(mapUnsplash(unsplashPhoto('big', { width: 8000, height: 12000 }), 360).full).toContain('w=3200');
  });

  it('ajoute les paramètres UTM', () => {
    expect(withUtm('https://unsplash.com/photos/x')).toBe('https://unsplash.com/photos/x?utm_source=prisme&utm_medium=referral');
    expect(withUtm('https://unsplash.com/?a=1')).toContain('?a=1&utm_source=');
  });

  it('distingue limite de requêtes et clé refusée', () => {
    expect(unsplashError(403, {}, 'Rate Limit Exceeded').kind).toBe('rate_limit');
    expect(unsplashError(200, { 'x-ratelimit-remaining': '0' }, '').kind).toBe('rate_limit');
    expect(unsplashError(401, {}, { errors: ['OAuth error'] }).kind).toBe('auth');
    expect(unsplashError(503, {}, '').kind).toBe('server');
  });
});

describe('Pexels', () => {
  it('normalise une photo', () => {
    const w = mapPexels(pexelsPhoto(42), 360);
    expect(w.id).toBe('pexels:42');
    expect(w.color).toBe('#A0522D');
    expect(w.thumb).toContain('fit=crop');
    expect(w.thumb).toContain('w=360');
    expect(w.full).toContain('w=2400');
    expect(w.author?.name).toBe('Grace Hopper');
    expect(w.pageUrl).toBe('https://www.pexels.com/photo/42/');
  });
});

describe('Wallhaven', () => {
  it('normalise un fond (miniature au format d’origine, couleur dominante)', () => {
    const w = mapWallhaven({
      id: 'abc123',
      url: 'https://wallhaven.cc/w/abc123',
      dimension_x: 1440,
      dimension_y: 3200,
      colors: ['#0066cc', '#000000'],
      path: 'https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg',
      thumbs: { original: 'https://th.wallhaven.cc/orig/ab/abc123.jpg', large: 'l', small: 's' },
    });
    expect(w).toMatchObject({ id: 'wallhaven:abc123', source: 'wallhaven', width: 1440, height: 3200, color: '#0066cc' });
    expect(w.thumb).toContain('/orig/');
    expect(w.full).toBe(w.preview);
  });
});

describe('Pixabay', () => {
  it('ramène les dimensions à l’image 1280 px servie', () => {
    expect(largeSize(3000, 6000)).toEqual({ width: 640, height: 1280 });
    expect(largeSize(800, 1000)).toEqual({ width: 800, height: 1000 });
    const w = mapPixabay({
      id: 9,
      pageURL: 'https://pixabay.com/photos/9/',
      tags: 'forêt, brume',
      webformatURL: 'https://cdn.pixabay.com/photo/2020/x_640.jpg',
      largeImageURL: 'https://cdn.pixabay.com/photo/2020/x_1280.jpg',
      imageWidth: 3000,
      imageHeight: 6000,
      user: 'Jean Dupont',
      user_id: 42,
    });
    expect(w.thumb).toBe('https://cdn.pixabay.com/photo/2020/x_340.jpg');
    expect(w.author?.url).toBe('https://pixabay.com/users/Jean%20Dupont-42/');
    expect(fitsWallpaper(w)).toBe(true);
  });
});

describe('Musée (Cleveland)', () => {
  it('prend l’image « print » et le nom de l’artiste', () => {
    const w = mapArtwork({
      id: 5,
      title: 'Twilight in the Wilderness',
      creation_date: '1860',
      url: 'https://clevelandart.org/art/1965.233',
      creators: [{ description: 'Frederic Edwin Church (American, 1826–1900)' }],
      images: {
        web: { url: 'https://openaccess-cdn.clevelandart.org/x_web.jpg', width: '700', height: '893' },
        print: { url: 'https://openaccess-cdn.clevelandart.org/x_print.jpg', width: '2666', height: '3400' },
      },
    });
    expect(w).toMatchObject({ id: 'art:5', width: 2666, height: 3400, alt: 'Twilight in the Wilderness (1860)' });
    expect(w?.author).toEqual({ name: 'Frederic Edwin Church', url: 'https://clevelandart.org/art/1965.233' });
    expect(w?.full).toContain('_print');
    expect(mapArtwork({ id: 6, title: 'Sans image', url: 'u', images: null })).toBeNull();
  });
});

describe('NASA', () => {
  it('utilise l’original quand l’API donne ses dimensions', () => {
    const w = mapNasa({
      data: [{ nasa_id: 'PIA 2', title: 'Nébuleuse', media_type: 'image', secondary_creator: 'NASA/JPL' }],
      links: [
        { href: 'https://images-assets.nasa.gov/image/PIA2/PIA2~thumb.jpg', rel: 'preview', render: 'image' },
        { href: 'https://images-assets.nasa.gov/image/PIA2/PIA2~large.jpg', rel: 'alternate', render: 'image', width: 1920, height: 2400 },
        { href: 'https://images-assets.nasa.gov/image/PIA2/PIA2~orig.png', rel: 'canonical', render: 'image', width: 4000, height: 5000 },
      ],
    });
    expect(w).toMatchObject({ width: 4000, height: 5000, full: 'https://images-assets.nasa.gov/image/PIA2/PIA2~orig.png' });
    expect(w?.preview).toContain('~large.jpg');
    expect(w?.author?.name).toBe('NASA/JPL');
    expect(w?.pageUrl).toBe('https://images.nasa.gov/details/PIA%202');
  });

  it('devine les variantes sans dimensions', () => {
    const w = mapNasa({
      data: [{ nasa_id: 'X', title: 'Terre', media_type: 'image', center: 'JSC' }],
      links: [{ href: 'https://images-assets.nasa.gov/image/X/X~thumb.jpg', rel: 'preview', render: 'image' }],
    });
    expect(w).toMatchObject({ width: 0, height: 0, preview: 'https://images-assets.nasa.gov/image/X/X~large.jpg', full: 'https://images-assets.nasa.gov/image/X/X~orig.jpg' });
    expect(w?.author?.name).toBe('NASA JSC');
    expect(fitsWallpaper(w as NonNullable<typeof w>)).toBe(true);
    expect(mapNasa({ data: [{ nasa_id: 'V', title: 'Vidéo', media_type: 'video' }], links: [] })).toBeNull();
  });
});
