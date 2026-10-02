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
}

function unsplashPhoto(id: string, i: number) {
  return {
    id,
    width: 3000,
    height: 6000,
    color: '#204080',
    alt_description: `montagne ${id}`,
    description: null,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=test&c=${i % COLORS.length}` },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=test` },
    user: { name: 'Ada Lovelace', links: { html: 'https://unsplash.com/@ada' } },
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
export async function mockApis(page: Page): Promise<ApiLog> {
  const log: ApiLog = { unsplash: [], pexels: [], downloads: [] };

  await page.route('https://api.unsplash.com/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/download')) {
      log.downloads.push(url);
      return json(route, { url: 'https://images.unsplash.com/x' });
    }
    log.unsplash.push(url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const prefix = url.pathname.replace(/\W+/g, '-') + (url.searchParams.get('query') ?? '');
    const photos = Array.from({ length: 30 }, (_, i) => unsplashPhoto(`${prefix}-p${page}-${i}`, i));
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
