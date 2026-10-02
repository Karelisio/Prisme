import { type Page, expect, test } from '@playwright/test';
import { makeQr } from '../../src/features/library/qr';
import { mockApis } from './mocks';

const DAY = 86_400_000;

const preview = (page: Page) => page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });
const library = (page: Page) => page.locator('.tab[data-active="true"]');
const overlay = (page: Page) => page.locator('.overlay-layer').last();
const overlayCells = (page: Page) => overlay(page).locator('.wp-cell');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

/** Fiche d'un fond pour la bibliothèque de test (les vignettes passent par les CDN simulés). */
function wallpaper(id: string, alt: string, color: string, source: 'unsplash' | 'pexels' | 'art' | 'device', shade = 0) {
  const host =
    source === 'pexels'
      ? 'https://images.pexels.com/photos/x.jpg'
      : source === 'art'
        ? 'https://openaccess-cdn.clevelandart.org/x_web.png'
        : `https://images.unsplash.com/photo-${id.replace(/\W+/g, '-')}`;
  const url = `${host}${host.includes('?') ? '&' : '?'}c=${shade}`;
  return { id, source, width: 1080, height: 2400, color, alt, thumb: url, preview: url, full: url };
}

const items = [
  wallpaper('unsplash:aube', 'Aube rose', '#e91e63', 'unsplash', 1),
  wallpaper('unsplash:brume', 'Brume bleue', '#1e88e5', 'unsplash', 0),
  wallpaper('unsplash:cime', 'Cime', '#0d47a1', 'unsplash', 2),
  wallpaper('pexels:2001', 'Dune rouge', '#d32f2f', 'pexels', 1),
  wallpaper('pexels:2002', 'Forêt', '#43a047', 'pexels', 2),
  wallpaper('art:77', 'Nocturne', '#808080', 'art', 3),
  wallpaper('device:photo.jpg', 'Photo du téléphone', '#808080', 'device', 4),
];

/**
 * Sauvegarde de départ : sept fonds dont six favoris (ajoutés dans un ordre qui diffère de tous les tris),
 * des étiquettes, une collection « Escapade » (avec une image de la galerie) et un historique.
 */
function backup(now: number) {
  const entry = (id: string, wallpaperId: string, daysAgo: number, auto = false) => ({
    id,
    wallpaperId,
    target: 'both',
    at: now - daysAgo * DAY,
    ...(auto && { auto: true }),
  });
  return {
    format: 'prisme-backup',
    version: 1,
    exportedAt: new Date(now).toISOString(),
    appVersion: 'test',
    library: {
      items: Object.fromEntries(items.map((w) => [w.id, w])),
      favorites: { 'unsplash:aube': 6000, 'unsplash:brume': 1000, 'unsplash:cime': 5000, 'pexels:2001': 3000, 'pexels:2002': 2000, 'art:77': 4000 },
      collections: [{ id: 'c-escapade', name: 'Escapade', createdAt: 1, itemIds: ['unsplash:brume', 'pexels:2002', 'device:photo.jpg'] }],
      // Brume appliquée 3 fois (6 jours à l'écran), Dune rouge 2 jours, Aube 1 jour.
      history: [
        entry('h5', 'unsplash:brume', 1, true),
        entry('h4', 'unsplash:aube', 2),
        entry('h3', 'unsplash:brume', 4),
        entry('h2', 'pexels:2001', 6, true),
        entry('h1', 'unsplash:brume', 9),
      ],
      tags: { 'unsplash:aube': ['plage'], 'unsplash:brume': ['plage', 'nuit'], 'pexels:2001': ['nuit'] },
      sort: 'added',
    },
    settings: {},
    automation: {},
  };
}

async function restore(page: Page, data: unknown) {
  await page.waitForFunction(() => !!window.__prismeSystemWeb);
  await page.evaluate((json) => {
    if (window.__prismeSystemWeb) window.__prismeSystemWeb.nextImport = json;
  }, JSON.stringify(data));
  await page.getByRole('button', { name: 'Réglages' }).click();
  await library(page)
    .getByRole('button', { name: /Restaurer une sauvegarde/ })
    .click();
  await expect(snackbar(page, 'Sauvegarde restaurée : 6 favoris, 1 collection')).toBeVisible();
}

async function openLibrary(page: Page, section?: 'Favoris' | 'Collections' | 'Historique') {
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  if (section) await library(page).getByRole('radio', { name: section }).click();
  return library(page);
}

/** Fonds de la grille, dans l'ordre affiché (le nom accessible est la description du fond). */
async function order(page: Page, scope = library(page)) {
  const labels = await scope.locator('.wp-cell').evaluateAll((cells) => cells.map((c) => c.getAttribute('aria-label') ?? ''));
  return labels;
}

/** Les API de recherche sont simulées ; les fonds retrouvés par identifiant le sont ici. */
async function mockById(page: Page, options: { gone?: string[] } = {}) {
  const log: string[] = [];
  await page.route(/https:\/\/api\.unsplash\.com\/photos\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    log.push(`unsplash:${id}`);
    if (options.gone?.includes(`unsplash:${id}`)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"errors":["Not found"]}' });
    const known = items.find((w) => w.id === `unsplash:${id}`);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        width: 3000,
        height: 6000,
        color: known?.color ?? '#204080',
        alt_description: known?.alt ?? id,
        description: null,
        urls: { raw: known?.thumb ?? `https://images.unsplash.com/photo-${id}?c=0` },
        links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=test` },
        user: { name: 'Ada Lovelace', username: 'ada', links: { html: 'https://unsplash.com/@ada' } },
      }),
    });
  });
  await page.route(/https:\/\/api\.pexels\.com\/v1\/photos\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    log.push(`pexels:${id}`);
    if (options.gone?.includes(`pexels:${id}`)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' });
    const known = items.find((w) => w.id === `pexels:${id}`);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: Number(id),
        width: 2400,
        height: 4800,
        url: `https://www.pexels.com/photo/${id}/`,
        photographer: 'Grace Hopper',
        photographer_url: 'https://www.pexels.com/@grace',
        avg_color: known?.color ?? '#A0522D',
        alt: known?.alt ?? `photo ${id}`,
        src: { original: known?.thumb ?? `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?c=0` },
      }),
    });
  });
  return log;
}

test.describe('étiquettes et tri', () => {
  test('étiqueter depuis l’aperçu (un fond non favori le devient), filtrer, retirer par appui long', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.locator('.tab[data-active="true"] .wp-cell').first().click();

    // Sans toucher au cœur : étiqueter ajoute aux favoris.
    await expect(preview(page).getByRole('button', { name: 'Ajouter aux favoris' })).toBeVisible();
    await preview(page).getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('button', { name: /^Étiquettes/ }).click();
    await expect(sheet(page, 'Étiquettes').getByText('Étiqueter un fond l’ajoute à tes favoris.')).toBeVisible();
    await sheet(page, 'Étiquettes').getByLabel('Nouvelle étiquette').fill('Plage');
    await sheet(page, 'Étiquettes').getByLabel('Nouvelle étiquette').press('Enter');
    await expect(snackbar(page, 'Ajouté aux favoris, étiquette « Plage »')).toBeVisible();
    await expect(sheet(page, 'Étiquettes').getByRole('button', { name: 'Retirer l’étiquette Plage' })).toBeVisible();
    await sheet(page, 'Étiquettes').getByLabel('Nouvelle étiquette').fill('nuit');
    await sheet(page, 'Étiquettes').getByRole('button', { name: 'Ajouter' }).click();
    await expect(sheet(page, 'Étiquettes').getByRole('button', { name: 'Retirer l’étiquette nuit' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview(page).getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();

    // Deuxième fond : l'étiquette déjà utilisée est proposée, et reprise avec son écriture d'origine.
    await page.keyboard.press('Escape');
    await page.locator('.tab[data-active="true"] .wp-cell').nth(1).click();
    await preview(page).getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await preview(page).getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('button', { name: /^Étiquettes/ }).click();
    await expect(sheet(page, 'Étiquettes').getByText('Déjà utilisées')).toBeVisible();
    await sheet(page, 'Étiquettes').getByLabel('Nouvelle étiquette').fill('  PLAGE ');
    await sheet(page, 'Étiquettes').getByRole('button', { name: 'Ajouter' }).click();
    await expect(sheet(page, 'Étiquettes').getByRole('button', { name: 'Retirer l’étiquette Plage' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Bibliothèque : filtre par étiquette.
    const lib = await openLibrary(page, 'Favoris');
    await expect(lib.locator('.wp-cell')).toHaveCount(2);
    const filter = lib.getByRole('group', { name: 'Filtrer par étiquette' });
    await expect(filter.getByRole('button')).toHaveText([/Plage\s*2/, /nuit\s*1/]);
    await filter.getByRole('button', { name: 'nuit, 1 fond' }).click();
    await expect(lib.locator('.wp-cell')).toHaveCount(1);
    await expect(filter.getByRole('button', { name: 'nuit, 1 fond' })).toHaveAttribute('aria-pressed', 'true');
    await filter.getByRole('button', { name: 'nuit, 1 fond' }).click();
    await expect(lib.locator('.wp-cell')).toHaveCount(2);

    // Appui long : la feuille des étiquettes s'ouvre sans ouvrir l'aperçu.
    const cell = lib.locator('.wp-cell').first();
    await cell.hover();
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(sheet(page, 'Étiquettes')).toBeVisible();
    await expect(preview(page)).toHaveCount(0);
    await sheet(page, 'Étiquettes').getByRole('button', { name: 'Retirer l’étiquette Plage' }).click();
    await page.keyboard.press('Escape');
    await expect(filter.getByRole('button', { name: 'Plage, 1 fond' })).toBeVisible();

    // Les étiquettes survivent au rechargement (IndexedDB).
    await page.reload();
    const again = await openLibrary(page, 'Favoris');
    await expect(again.getByRole('group', { name: 'Filtrer par étiquette' }).getByRole('button')).toHaveCount(2);
  });

  test('tri par date d’ajout, couleur, source et nom ; le choix est conservé', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const lib = await openLibrary(page, 'Favoris');

    // Date d'ajout (par défaut) : le dernier ajouté d'abord.
    await expect(lib.getByRole('button', { name: /Tri : date d’ajout/ })).toBeVisible();
    await expect.poll(() => order(page)).toEqual(['Aube rose', 'Cime', 'Nocturne', 'Dune rouge', 'Forêt', 'Brume bleue']);

    const sortBy = async (label: string) => {
      await lib.getByRole('button', { name: /^Tri :/ }).click();
      await sheet(page, 'Trier les favoris').getByRole('button', { name: new RegExp(`^${label}`) }).click();
    };

    // Couleur : du rouge au rose (sombre avant clair dans une teinte), couleur inconnue en dernier.
    await sortBy('Couleur');
    await expect.poll(() => order(page)).toEqual(['Dune rouge', 'Forêt', 'Brume bleue', 'Cime', 'Aube rose', 'Nocturne']);
    await expect(lib.getByRole('button', { name: /Tri : couleur/ })).toBeVisible();

    // Source : Cleveland Museum of Art, Pexels, Unsplash (le plus récemment ajouté d'abord dans chacune).
    await sortBy('Source');
    await expect.poll(() => order(page)).toEqual(['Nocturne', 'Dune rouge', 'Forêt', 'Aube rose', 'Cime', 'Brume bleue']);

    // Nom : ordre alphabétique.
    await sortBy('Nom');
    await expect.poll(() => order(page)).toEqual(['Aube rose', 'Brume bleue', 'Cime', 'Dune rouge', 'Forêt', 'Nocturne']);

    // Le tri est mémorisé, y compris après un rechargement.
    await page.reload();
    const again = await openLibrary(page, 'Favoris');
    await expect(again.getByRole('button', { name: /Tri : nom/ })).toBeVisible();
    await expect.poll(() => order(page)).toEqual(['Aube rose', 'Brume bleue', 'Cime', 'Dune rouge', 'Forêt', 'Nocturne']);
  });

  test('étiquettes et tri sont dans la sauvegarde', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const lib = await openLibrary(page, 'Favoris');
    await lib.getByRole('button', { name: /^Tri :/ }).click();
    await sheet(page, 'Trier les favoris').getByRole('button', { name: /^Source/ }).click();

    await page.getByRole('button', { name: 'Réglages' }).click();
    await library(page)
      .getByRole('button', { name: /Exporter une sauvegarde/ })
      .click();
    await expect(snackbar(page, /Sauvegarde enregistrée/)).toBeVisible();
    const exported = await page.evaluate(() => window.__prismeSystemWeb?.exports.at(-1)?.data ?? '{}');
    const saved = JSON.parse(exported);
    expect(saved.library.sort).toBe('source');
    expect(saved.library.tags).toEqual({ 'unsplash:aube': ['plage'], 'unsplash:brume': ['plage', 'nuit'], 'pexels:2001': ['nuit'] });
  });
});

test.describe('collections automatiques', () => {
  test('par couleur, par source, jamais et récemment appliqués : calculées et non modifiables', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const lib = await openLibrary(page, 'Collections');

    await expect(lib.getByRole('heading', { name: 'Collections automatiques' })).toBeVisible();
    const card = (name: string) => lib.getByRole('button', { name: new RegExp(`^${name}\\s*\\d+ fonds?$`) });
    await expect(card('Récemment appliqués')).toContainText('3 fonds');
    await expect(card('Jamais appliqués')).toContainText('4 fonds');
    await expect(card('Bleus')).toContainText('2 fonds');
    await expect(card('Rouges')).toContainText('1 fond');
    await expect(card('Verts')).toContainText('1 fond');
    await expect(card('Roses')).toContainText('1 fond');
    await expect(card('Unsplash')).toContainText('3 fonds');
    await expect(card('Pexels')).toContainText('2 fonds');
    await expect(card('Cleveland Museum of Art')).toContainText('1 fond');
    await expect(card('Galerie du téléphone')).toContainText('1 fond');
    // Pas de famille pour les fonds dont la couleur est inconnue.
    await expect(lib.getByRole('button', { name: /^Gris/ })).toHaveCount(0);

    await card('Jamais appliqués').click();
    await expect(overlay(page).getByRole('heading', { name: 'Jamais appliqués' })).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(4);
    await expect(overlay(page).getByText(/Collection automatique/)).toBeVisible();
    // Calculée : ni renommage ni suppression, mais on peut la partager.
    await expect(overlay(page).getByRole('button', { name: 'Renommer' })).toHaveCount(0);
    await expect(overlay(page).getByRole('button', { name: 'Supprimer la collection' })).toHaveCount(0);
    await expect(overlay(page).getByRole('button', { name: 'Partager la collection' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Une famille de teintes : les fonds bleus.
    await card('Bleus').click();
    await expect(overlay(page).getByRole('heading', { name: 'Bleus' })).toBeVisible();
    expect((await order(page, overlay(page))).sort()).toEqual(['Brume bleue', 'Cime']);
  });

  test('un fond appliqué passe de « Jamais appliqués » à « Récemment appliqués »', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const lib = await openLibrary(page, 'Collections');
    await lib.getByRole('button', { name: /^Jamais appliqués/ }).click();
    await overlayCells(page).first().click();
    const name = await preview(page).locator('.preview__image').getAttribute('alt');
    expect(name).toBe('Cime');
    await preview(page).getByRole('button', { name: 'Appliquer' }).click();
    await page.getByRole('button', { name: "Écran d'accueil" }).click();
    await expect(snackbar(page, 'Fond appliqué')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlayCells(page)).toHaveCount(3);
    expect(await order(page, overlay(page))).not.toContain('Cime');
    await page.keyboard.press('Escape');
    await expect(lib.getByRole('button', { name: /^Récemment appliqués/ })).toContainText('4 fonds');
    await expect(lib.getByRole('button', { name: /^Jamais appliqués/ })).toContainText('3 fonds');
  });
});

test.describe('statistiques', () => {
  test('fonds les plus appliqués, temps passé et répartition par source', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    await openLibrary(page);
    await page.getByRole('button', { name: 'Statistiques' }).click();
    const stats = overlay(page);

    await expect(stats.getByRole('heading', { name: 'Statistiques' })).toBeVisible();
    await expect(stats.getByText('5 applications', { exact: true })).toBeVisible();
    await expect(stats.getByText(/^depuis le \d{1,2} \p{L}+ \d{4}, dont 2 automatiques$/u)).toBeVisible();

    // Plus appliqués : Brume ×3, puis Dune rouge (plus longtemps affichée) avant Aube.
    const top = stats.locator('section[aria-labelledby="stats-top"] .stat-row');
    await expect(top).toHaveCount(3);
    await expect(top.nth(0)).toContainText('Brume bleue');
    await expect(top.nth(0)).toContainText('3 fois');
    await expect(top.nth(1)).toContainText('Dune rouge');
    await expect(top.nth(2)).toContainText('Aube rose');

    // Temps passé : 3 + 2 + 1 jours pour Brume, 2 jours pour Dune rouge, 1 jour pour Aube.
    const time = stats.locator('section[aria-labelledby="stats-time"] .stat-row');
    await expect(time.nth(0)).toContainText('Brume bleue');
    await expect(time.nth(0)).toContainText('6 j');
    await expect(time.nth(1)).toContainText('Dune rouge');
    await expect(time.nth(1)).toContainText('2 j');
    await expect(time.nth(2)).toContainText('Aube rose');
    await expect(time.nth(2)).toContainText('1 j');

    // Barres horizontales : la plus longue occupe toute la largeur, les autres sont proportionnelles.
    const widths = await top.locator('.bar__fill').evaluateAll((bars) => bars.map((b) => (b as HTMLElement).style.width));
    expect(widths[0]).toBe('100%');
    expect(widths[1]).toBe('33%');

    // Par source : 4 applications Unsplash sur 5.
    const sources = stats.locator('section[aria-labelledby="stats-source"] .stat-row');
    await expect(sources.nth(0)).toContainText('Unsplash');
    await expect(sources.nth(0)).toContainText('80 %');
    await expect(sources.nth(0)).toContainText('4 applications · 7 j');
    await expect(sources.nth(1)).toContainText('Pexels');
    await expect(sources.nth(1)).toContainText('20 %');

    // Un fond du classement ouvre son aperçu.
    await top.nth(0).click();
    await expect(preview(page).locator('.preview__image')).toHaveAttribute('alt', 'Brume bleue');
  });

  test('les fonds appliqués par un automatisme (journal natif) sont versés à l’historique à l’ouverture', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    await openLibrary(page);
    // Rotation qui a tourné app fermée : le journal du natif n'a pas encore été relu.
    await page.evaluate(
      (entry) => window.__prismeAutomationWeb?.pendingLog.push(entry),
      { id: 'unsplash:cime', target: 'both' as const, at: Date.now() - 12 * 3_600_000, reason: 'rotation' as const },
    );
    await page.getByRole('button', { name: 'Statistiques' }).click();
    const stats = overlay(page);

    await expect(stats.getByText('6 applications', { exact: true })).toBeVisible();
    await expect(stats.getByText(/dont 3 automatiques$/)).toBeVisible();
    // Cime est à l'écran depuis 12 h ; Brume, remplacée il y a 12 h, perd ces heures de son dernier passage.
    const time = stats.locator('section[aria-labelledby="stats-time"] .stat-row');
    await expect(time.filter({ hasText: 'Cime' })).toContainText('12 h');
    await expect(time.filter({ hasText: 'Brume bleue' })).toContainText('5 j 12 h');
  });

  test('sans historique : message d’accueil', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await openLibrary(page);
    await page.getByRole('button', { name: 'Statistiques' }).click();
    await expect(overlay(page).getByText('Pas encore de statistiques')).toBeVisible();
  });
});

test.describe('partage d’une collection', () => {
  async function shareEscapade(page: Page) {
    const lib = await openLibrary(page, 'Collections');
    await lib.getByRole('button', { name: /^Escapade/ }).click();
    await expect(overlayCells(page)).toHaveCount(3);
    await overlay(page).getByRole('button', { name: 'Partager la collection' }).click();
    return sheet(page, 'Partager « Escapade »');
  }

  test('lien, code et QR code : partager, supprimer, puis ajouter à sa bibliothèque depuis le message collé', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockApis(page);
    const byId = await mockById(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));

    const share = await shareEscapade(page);
    // L'image de la galerie reste sur le téléphone : message d'explication.
    await expect(share.getByText(/^2 fonds partagés/)).toBeVisible();
    await expect(share.getByText('1 fond n’est pas inclus : importé de la galerie ou créé dans Prisme, son image reste sur ce téléphone.')).toBeVisible();

    // Lien : menu de partage Android avec une phrase, le lien cliquable et le code en clair.
    await share.getByRole('button', { name: 'Partager le lien' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeSystemWeb?.sharedTexts.length ?? 0)).toBe(1);
    const shared = await page.evaluate(() => window.__prismeSystemWeb?.sharedTexts[0]);
    expect(shared?.title).toBe('Collection Prisme : Escapade');
    const text = shared?.text ?? '';
    expect(text).toContain('« Escapade » (2 fonds d’écran)');
    const link = /prisme:\/\/collection\/([A-Za-z0-9_-]+)/.exec(text);
    expect(link).not.toBeNull();
    const code = link?.[1] ?? '';
    expect(text.trim().endsWith(code)).toBe(true);

    // Code à copier.
    await share.getByRole('button', { name: 'Copier le code' }).click();
    await expect(snackbar(page, 'Code copié')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);

    // QR code : il contient exactement le lien.
    const qr = share.getByRole('img', { name: 'QR code de la collection' });
    await expect(qr).toBeVisible();
    expect(await qr.locator('path').getAttribute('d')).toBe(makeQr(`prisme://collection/${code}`)?.path);
    await page.keyboard.press('Escape');

    // Le destinataire n'a pas la collection : on la supprime ici avant de la « recevoir ».
    await overlay(page).getByRole('button', { name: 'Supprimer la collection' }).click();
    await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
    const lib = library(page);
    await expect(lib.getByRole('button', { name: /^Escapade/ })).toHaveCount(0);

    // Coller le message entier.
    await lib.getByRole('button', { name: 'Coller un code' }).click();
    await page.getByRole('alertdialog', { name: 'Coller un code' }).getByRole('textbox').fill(text);
    await page.getByRole('button', { name: 'Ouvrir' }).click();

    const received = overlay(page);
    await expect(received.getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await expect(received.getByText(/^2 fonds retrouvés\.$/)).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(2);
    await expect(overlayCells(page).first()).toHaveAttribute('aria-label', /Brume bleue/);
    expect(byId.sort()).toEqual(['pexels:2002', 'unsplash:brume']);

    await received.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click();
    await expect(snackbar(page, 'Collection « Escapade » ajoutée à ta bibliothèque')).toBeVisible();
    // On arrive sur la collection créée.
    await expect(overlay(page).getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(lib.getByRole('button', { name: /^Escapade/ })).toContainText('2 fonds');
  });

  test('lien ouvert depuis l’extérieur : fonds introuvables signalés, ajout impossible sans rien retrouvé, lien abîmé refusé', async ({ page }) => {
    await mockApis(page);
    await mockById(page, { gone: ['unsplash:brume'] });
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const share = await shareEscapade(page);
    await share.getByRole('button', { name: 'Partager le lien' }).click();
    const text = (await page.evaluate(() => window.__prismeSystemWeb?.sharedTexts[0]?.text)) ?? '';
    const link = /prisme:\/\/collection\/[A-Za-z0-9_-]+/.exec(text)?.[0] ?? '';
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Android ouvre le lien : aperçu de la collection reçue.
    await page.evaluate((url) => window.__prismeLibraryWeb?.triggerLink(url), link);
    const received = overlay(page);
    await expect(received.getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await expect(received.getByText('1 fond retrouvé, 1 introuvable (retiré par leur source).')).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(1);
    // Le même lien reçu deux fois de suite n'empile pas deux écrans.
    await page.evaluate((url) => window.__prismeLibraryWeb?.triggerLink(url), link);
    await expect(page.locator('.overlay-layer')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.overlay-layer')).toHaveCount(0);

    // Plus aucun fond chez leurs sources : rien à ajouter.
    await mockById(page, { gone: ['unsplash:brume', 'pexels:2002'] });
    await page.evaluate((url) => window.__prismeLibraryWeb?.triggerLink(url), link);
    await expect(received.getByText('0 fond retrouvé, 2 introuvables (retirés par leur source).')).toBeVisible();
    await expect(received.getByText('Aucun fond récupéré')).toBeVisible();
    await expect(received.getByRole('button', { name: 'Ajouter à ma bibliothèque' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // Lien dont le code est abîmé : message, et pas d'écran.
    await page.evaluate(() => window.__prismeLibraryWeb?.triggerLink('prisme://collection/ceciNestPasUnCodeDeCollection'));
    await expect(snackbar(page, 'Ce code n’est pas une collection Prisme')).toBeVisible();
    await expect(page.locator('.overlay-layer')).toHaveCount(0);
  });

  test('scanner un QR : lecture d’un lien, QR étranger, téléphone sans services Google Play', async ({ page }) => {
    await mockApis(page);
    await mockById(page);
    await page.goto('/');
    await restore(page, backup(Date.now()));
    const share = await shareEscapade(page);
    await share.getByRole('button', { name: 'Partager le lien' }).click();
    const text = (await page.evaluate(() => window.__prismeSystemWeb?.sharedTexts[0]?.text)) ?? '';
    const link = /prisme:\/\/collection\/[A-Za-z0-9_-]+/.exec(text)?.[0] ?? '';
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    const lib = await openLibrary(page, 'Collections');
    await page.evaluate((value) => {
      if (window.__prismeLibraryWeb) window.__prismeLibraryWeb.nextScan = value;
    }, link);
    await lib.getByRole('button', { name: 'Scanner un QR' }).click();
    await expect(overlay(page).getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Un QR code qui n'est pas une collection Prisme.
    await page.evaluate(() => {
      if (window.__prismeLibraryWeb) window.__prismeLibraryWeb.nextScan = 'https://example.com/une-adresse-tres-longue-qui-ne-vient-pas-de-prisme';
    });
    await lib.getByRole('button', { name: 'Scanner un QR' }).click();
    await expect(snackbar(page, 'Ce code n’est pas une collection Prisme')).toBeVisible();

    // Scanner refermé sans rien lire : rien ne se passe.
    await lib.getByRole('button', { name: 'Scanner un QR' }).click();
    await expect(page.locator('.overlay-layer')).toHaveCount(0);

    // Sans services Google Play : message clair, et le code collé reste possible.
    await page.evaluate(() => {
      if (window.__prismeLibraryWeb) window.__prismeLibraryWeb.scannerAvailable = false;
    });
    await lib.getByRole('button', { name: 'Scanner un QR' }).click();
    await expect(snackbar(page, 'Le scanner de QR code demande les services Google Play, absents de ce téléphone. Utilise « Coller un code » à la place.')).toBeVisible();
  });

  test('coller un code : erreur lisible pour un texte qui n’en est pas un', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const lib = await openLibrary(page, 'Collections');
    await lib.getByRole('button', { name: 'Coller un code' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Coller un code' });
    await expect(dialog.getByRole('button', { name: 'Ouvrir' })).toBeDisabled();
    await dialog.getByRole('textbox').fill('bonjour, voici ma collection de fonds');
    await dialog.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Ce code n’est pas une collection Prisme');
    // Le message disparaît dès qu'on corrige le texte ; annuler ferme la fenêtre.
    await dialog.getByRole('textbox').fill('x');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('une collection de fonds locaux seulement ne peut pas être partagée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const data = backup(Date.now());
    data.library.collections = [{ id: 'c-local', name: 'Mes imports', createdAt: 1, itemIds: ['device:photo.jpg'] }];
    await restore(page, data);
    const lib = await openLibrary(page, 'Collections');
    await lib.getByRole('button', { name: /^Mes imports/ }).click();
    await overlay(page).getByRole('button', { name: 'Partager la collection' }).click();
    const share = sheet(page, 'Partager « Mes imports »');
    await expect(share.getByText('Aucun fond de cette collection ne peut être partagé.')).toBeVisible();
    await expect(share.getByText(/1 fond n’est pas inclus/)).toBeVisible();
    await expect(share.getByRole('button', { name: 'Partager le lien' })).toHaveCount(0);
  });
});
