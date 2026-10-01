import { describe, expect, it } from 'vitest';
import { pexelsPhoto, unsplashPhoto } from './__fixtures__/photos';
import { mapPexels } from './pexels';
import { mapUnsplash, unsplashError, withUtm } from './unsplash';

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
    expect(w.author).toEqual({ name: 'Ada Lovelace', url: 'https://unsplash.com/@ada?utm_source=prisme&utm_medium=referral' });
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
