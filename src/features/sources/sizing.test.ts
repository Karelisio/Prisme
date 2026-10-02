import { describe, expect, it } from 'vitest';
import { coverWidth, screenSizedUrl } from './sizing';
import type { Wallpaper } from './types';

const screen = { width: 1080, height: 2400 };
const wp = (full: string, width = 4000, height = 6000): Wallpaper => ({
  id: 'x',
  source: 'unsplash',
  width,
  height,
  color: '#000',
  alt: '',
  thumb: '',
  preview: '',
  full,
});

describe('images à la taille de l’écran', () => {
  it('largeur juste suffisante pour couvrir l’écran', () => {
    // Image plus « large » que l'écran : la hauteur décide.
    expect(coverWidth({ width: 4000, height: 6000 }, screen)).toBe(1600);
    // Image plus étroite que l'écran : la largeur de l'écran suffit.
    expect(coverWidth({ width: 1000, height: 3000 }, screen)).toBe(1000);
    expect(coverWidth({ width: 2000, height: 6000 }, screen)).toBe(1080);
  });

  it('réécrit les URL Unsplash et Pexels, laisse les autres', () => {
    const unsplash = new URL(screenSizedUrl(wp('https://images.unsplash.com/photo-1?w=3200&fit=max&q=90&fm=jpg'), screen));
    expect(unsplash.searchParams.get('w')).toBe('1600');
    expect(unsplash.searchParams.get('q')).toBe('80');
    expect(unsplash.searchParams.get('fm')).toBe('jpg');
    const pexels = new URL(screenSizedUrl(wp('https://images.pexels.com/photos/1/a.jpeg?auto=compress&cs=tinysrgb&w=3200'), screen));
    expect(pexels.searchParams.get('w')).toBe('1600');
    expect(pexels.searchParams.get('auto')).toBe('compress');
    expect(screenSizedUrl(wp('https://cdn.exemple.com/pack/1.jpg'), screen)).toBe('https://cdn.exemple.com/pack/1.jpg');
    expect(screenSizedUrl(wp('/data/imports/x.jpg'), screen)).toBe('/data/imports/x.jpg');
  });
});
