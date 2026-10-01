import type { PexelsPhoto } from '../pexels';
import type { UnsplashPhoto } from '../unsplash';

export function unsplashPhoto(id: string, overrides: Partial<UnsplashPhoto> = {}): UnsplashPhoto {
  return {
    id,
    width: 3000,
    height: 6000,
    color: '#204060',
    alt_description: `photo ${id}`,
    description: null,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=abc` },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc` },
    user: { name: 'Ada Lovelace', links: { html: 'https://unsplash.com/@ada' } },
    ...overrides,
  };
}

export function pexelsPhoto(id: number, overrides: Partial<PexelsPhoto> = {}): PexelsPhoto {
  return {
    id,
    width: 2400,
    height: 4800,
    url: `https://www.pexels.com/photo/${id}/`,
    photographer: 'Grace Hopper',
    photographer_url: 'https://www.pexels.com/@grace',
    avg_color: '#A0522D',
    alt: `pexels ${id}`,
    src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` },
    ...overrides,
  };
}
