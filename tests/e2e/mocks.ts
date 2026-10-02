import type { Page, Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/** PNG uni généré à la volée : évite de versionner des images de test. */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLORS: [number, number, number][] = [
  [32, 64, 128],
  [180, 90, 60],
  [40, 140, 90],
  [120, 60, 150],
  [200, 170, 60],
];

export interface ApiLog {
  unsplash: URL[];
  pexels: URL[];
  downloads: URL[];
  wallhaven: URL[];
  pixabay: URL[];
  art: URL[];
  nasa: URL[];
}

/** Sources sans clé (et Pixabay) : réponses vides par défaut, pour ne pas changer les grilles existantes. */
export interface MockOptions {
  wallhaven?: boolean;
  pixabay?: boolean;
  art?: boolean;
  nasa?: boolean;
  /** Montre l'introduction du premier lancement ; par défaut elle est marquée comme déjà vue. */
  intro?: boolean;
  /** Garde les animations et transitions ; par défaut le mouvement est réduit (pas de transition entre écrans). */
  motion?: boolean;
  /** Formats (largeur, hauteur) des photos Unsplash, repris en boucle ; par défaut 3000 × 6000. */
  sizes?: [number, number][];
}

/** Clé du stockage de l'introduction (voir features/onboarding/store.ts) : « déjà vue ». */
const INTRO_SEEN = ['prisme-onboarding', JSON.stringify({ state: { seen: true }, version: 1 })] as const;

function unsplashPhoto(id: string, i: number, [width, height]: [number, number] = [3000, 6000]) {
  return {
    id,
    width,
    height,
    color: '#204080',
    alt_description: `montagne ${id}`,
    description: null,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=test&c=${i % COLORS.length}` },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=test` },
    user: { name: 'Ada Lovelace', username: 'ada', links: { html: 'https://unsplash.com/@ada' } },
  };
}

function wallhavenItem(id: string, i: number) {
  return {
    id,
    url: `https://wallhaven.cc/w/${id}`,
    dimension_x: 1440,
    dimension_y: 3200,
    colors: ['#0066cc', '#000000'],
    path: `https://w.wallhaven.cc/full/wh/wallhaven-${id}.png?c=${i % COLORS.length}`,
    thumbs: { original: `https://th.wallhaven.cc/orig/wh/${id}.png?c=${i % COLORS.length}`, large: '', small: '' },
  };
}

function pixabayHit(id: number) {
  return {
    id,
    pageURL: `https://pixabay.com/photos/${id}/`,
    tags: `brume, lac ${id}`,
    webformatURL: `https://cdn.pixabay.com/photo/${id}_640.png?c=${id % COLORS.length}`,
    largeImageURL: `https://cdn.pixabay.com/photo/${id}_1280.png?c=${id % COLORS.length}`,
    imageWidth: 3000,
    imageHeight: 6000,
    user: 'Hedy Lamarr',
    user_id: 7,
  };
}

function artwork(id: number) {
  return {
    id,
    title: `Paysage ${id}`,
    creation_date: '1860',
    url: `https://clevelandart.org/art/${id}`,
    creators: [{ description: 'Frederic Edwin Church (American, 1826–1900)' }],
    images: {
      web: { url: `https://openaccess-cdn.clevelandart.org/${id}_web.png?c=${id % COLORS.length}`, width: '700', height: '893' },
      print: { url: `https://openaccess-cdn.clevelandart.org/${id}_print.png?c=${id % COLORS.length}`, width: '2666', height: '3400' },
    },
  };
}

function nasaItem(id: string, i: number) {
  const base = `https://images-assets.nasa.gov/image/${id}/${id}`;
  return {
    data: [{ nasa_id: id, title: `Nébuleuse ${id}`, media_type: 'image', center: 'GSFC' }],
    links: [
      { href: `${base}~thumb.png?c=${i % COLORS.length}`, rel: 'preview', render: 'image' },
      // Une image sur deux sans dimensions : l'aperçu les mesure.
      ...(i % 2 === 0 ? [{ href: `${base}~orig.png?c=${i % COLORS.length}`, rel: 'canonical', render: 'image', width: 4000, height: 3000 }] : []),
    ],
  };
}

function pexelsPhoto(id: number) {
  return {
    id,
    width: 2400,
    height: 4800,
    url: `https://www.pexels.com/photo/${id}/`,
    photographer: 'Grace Hopper',
    photographer_url: 'https://www.pexels.com/@grace',
    avg_color: '#A0522D',
    alt: `forêt ${id}`,
    src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?c=${id % COLORS.length}` },
  };
}

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Intercepte les API et les CDN d'images ; renvoie le journal des requêtes pour les assertions. */
export async function mockApis(page: Page, options: MockOptions = {}): Promise<ApiLog> {
  const log: ApiLog = { unsplash: [], pexels: [], downloads: [], wallhaven: [], pixabay: [], art: [], nasa: [] };

  // L'introduction du premier lancement masquerait l'app : elle est marquée comme déjà vue (sans écraser un état existant).
  if (!options.intro) {
    await page.addInitScript(([key, value]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
      } catch {
        // Stockage indisponible : rien à marquer.
      }
    }, INTRO_SEEN);
  }
  // Transitions entre écrans : coupées par défaut (elles bloquent brièvement les gestes), activées par les tests qui les
  // vérifient, ou pour toute la suite avec PRISME_E2E_MOTION=1.
  const motion = options.motion ?? process.env.PRISME_E2E_MOTION === '1';
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' });

  await page.route('https://api.unsplash.com/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/download')) {
      log.downloads.push(url);
      return json(route, { url: 'https://images.unsplash.com/x' });
    }
    log.unsplash.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const prefix = url.pathname.replace(/\W+/g, '-') + (url.searchParams.get('query') ?? '');
    const dark = url.searchParams.get('color') === 'black';
    const photos = Array.from({ length: 30 }, (_, i) => ({
      ...unsplashPhoto(`${prefix}-p${page}-${i}`, i, options.sizes?.[i % options.sizes.length]),
      ...(dark && { color: '#0a0a0a' }),
    }));
    if (url.pathname === '/search/photos') return json(route, { total: 90, total_pages: 3, results: photos });
    return json(route, photos);
  });

  await page.route('https://api.pexels.com/**', (route) => {
    const url = new URL(route.request().url());
    log.pexels.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const base = page * 1000 + (url.pathname.includes('search') ? 500 : 0);
    const photos = Array.from({ length: 40 }, (_, i) => pexelsPhoto(base + i));
    return json(route, { page, per_page: 40, photos, next_page: page < 3 ? 'next' : undefined });
  });

  await page.route('https://wallhaven.cc/api/**', (route) => {
    const url = new URL(route.request().url());
    log.wallhaven.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const tag = (url.searchParams.get('sorting') ?? '') + (url.searchParams.get('q') ?? '').replace(/\W+/g, '');
    const data = options.wallhaven ? Array.from({ length: 24 }, (_, i) => wallhavenItem(`${tag}${page}x${i}`, i)) : [];
    return json(route, { data, meta: { current_page: page, last_page: 2, per_page: 24, total: 48 } });
  });

  await page.route('https://pixabay.com/api/**', (route) => {
    const url = new URL(route.request().url());
    log.pixabay.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const hits = options.pixabay ? Array.from({ length: 40 }, (_, i) => pixabayHit(page * 100 + i)) : [];
    return json(route, { total: 80, totalHits: options.pixabay ? 80 : 0, hits });
  });

  await page.route('https://openaccess-api.clevelandart.org/**', (route) => {
    const url = new URL(route.request().url());
    log.art.push(url);
    const skip = Number(url.searchParams.get('skip') ?? '0');
    const data = options.art ? Array.from({ length: 20 }, (_, i) => artwork(skip + i + 1)) : [];
    return json(route, { info: { total: data.length }, data });
  });

  await page.route('https://images-api.nasa.gov/**', (route) => {
    const url = new URL(route.request().url());
    log.nasa.push(url);
    const q = (url.searchParams.get('q') ?? '').replace(/\W+/g, '');
    const items = options.nasa ? Array.from({ length: 10 }, (_, i) => nasaItem(`${q}${i}`, i)) : [];
    return json(route, { collection: { items, links: [] } });
  });

  await page.route(
    /https:\/\/((th|w)\.wallhaven\.cc|cdn\.pixabay\.com|openaccess-cdn\.clevelandart\.org|images-assets\.nasa\.gov)\/.*/,
    (route) => {
      const url = new URL(route.request().url());
      const color = COLORS[Number(url.searchParams.get('c') ?? '0') % COLORS.length] as [number, number, number];
      // Les variantes « ~large » de la NASA n'existent pas ici : l'aperçu se rabat sur l'original.
      if (url.pathname.includes('~large')) return route.fulfill({ status: 404, body: '' });
      const landscape = url.hostname === 'images-assets.nasa.gov';
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: landscape ? solidPng(160, 120, color) : solidPng(90, 160, color),
      });
    },
  );

  await page.route(/https:\/\/images\.(unsplash|pexels)\.com\/.*/, (route) => {
    const url = new URL(route.request().url());
    const color = COLORS[Number(url.searchParams.get('c') ?? '0') % COLORS.length] as [number, number, number];
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: solidPng(90, 160, color),
    });
  });

  await page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    json(route, { results: [{ name: 'Lyon', latitude: 45.76, longitude: 4.84, country: 'France', admin1: 'Auvergne-Rhône-Alpes' }] }),
  );
  await page.route('https://api.open-meteo.com/**', (route) => json(route, { current: { weather_code: 61, is_day: 1 } }));

  // Manifeste des packs distant : indisponible, l'app utilise la copie embarquée.
  await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ status: 404, body: '' }));

  // Pas de release publiée par défaut : aucune proposition de mise à jour pendant les tests.
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));

  return log;
}
