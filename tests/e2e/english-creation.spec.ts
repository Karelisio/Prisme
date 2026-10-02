import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

/**
 * Interface en anglais : bibliothèque, collage et éditeur. Le réglage de la langue est enregistré avec les
 * réglages : tout se prépare en français (libellés connus), puis on passe en anglais depuis les réglages.
 * Ensuite, la navigation ne s'appuie que sur la position des onglets et sur des classes, pas sur des libellés
 * d'autres écrans.
 */

const DAY = 86_400_000;
/** Date figée (milieu de juin : pas de changement d'heure) : « Yesterday » et les durées ne dépendent pas du jour où le test tourne. */
const NOW = new Date('2026-06-17T12:00:00+02:00').getTime();

/** Barre de navigation : Explorer, Bibliothèque, Réglages (le libellé dépend de la langue). */
const goTo = (page: Page, tab: 'explore' | 'library' | 'settings') => page.locator('.nav-bar__item').nth(['explore', 'library', 'settings'].indexOf(tab)).click();
const screen = (page: Page) => page.locator('.tab[data-active="true"]');
const overlay = (page: Page) => page.locator('.overlay-layer').last();
const overlayCells = (page: Page) => overlay(page).locator('.wp-cell');
const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });

/** Réglages › Langue › English (le groupe s'appelle encore « Langue » : on part de l'interface française). */
async function switchToEnglish(page: Page) {
  await goTo(page, 'settings');
  await screen(page).getByRole('group', { name: 'Langue' }).getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

async function enableFeature(page: Page, name: string) {
  await goTo(page, 'settings');
  await screen(page).getByRole('switch', { name }).click();
}

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

/** Sauvegarde de départ : six favoris étiquetés, une collection « Escapade » (avec une image de la galerie) et un historique. */
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

/** Restaure la sauvegarde depuis les réglages (en français : la langue n'est pas encore changée). */
async function restore(page: Page, data: unknown) {
  await page.waitForFunction(() => !!window.__prismeSystemWeb);
  await page.evaluate((json) => {
    if (window.__prismeSystemWeb) window.__prismeSystemWeb.nextImport = json;
  }, JSON.stringify(data));
  await goTo(page, 'settings');
  await screen(page)
    .getByRole('button', { name: /Restaurer une sauvegarde/ })
    .click();
  await expect(snackbar(page, 'Sauvegarde restaurée : 6 favoris, 1 collection')).toBeVisible();
}

/** Les fonds retrouvés par identifiant (collection reçue) : simulés, certains pouvant avoir disparu chez leur source. */
async function mockById(page: Page, gone: string[] = []) {
  await page.route(/https:\/\/api\.unsplash\.com\/photos\/[^/]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    if (gone.includes(`unsplash:${id}`)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"errors":["Not found"]}' });
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
}

test.describe('bibliothèque en anglais', () => {
  test('onglets, favoris, tri et étiquettes', async ({ page }) => {
    await mockApis(page);
    await page.clock.setFixedTime(NOW);
    await page.goto('/');
    await restore(page, backup(NOW));
    await switchToEnglish(page);
    await goTo(page, 'library');
    const lib = screen(page);

    await expect(lib.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(lib.getByRole('radiogroup', { name: 'Section' }).getByRole('radio')).toHaveText(['Favorites', 'Collections', 'History']);
    await expect(lib.getByRole('button', { name: 'Statistics' })).toBeVisible();
    await expect(lib.getByRole('button', { name: 'Import' })).toBeVisible();

    // Favoris : tri et filtre par étiquette (les étiquettes sont celles de l'utilisateur, jamais traduites).
    await expect(lib.getByRole('button', { name: 'Sort: date added' })).toBeVisible();
    const filter = lib.getByRole('group', { name: 'Filter by tag' });
    await expect(filter.getByRole('button', { name: 'plage, 2 wallpapers' })).toBeVisible();
    await expect(filter.getByRole('button', { name: 'nuit, 2 wallpapers' })).toBeVisible();
    await filter.getByRole('button', { name: 'plage, 2 wallpapers' }).click();
    await expect(lib.locator('.wp-cell')).toHaveCount(2);
    await filter.getByRole('button', { name: 'plage, 2 wallpapers' }).click();
    await expect(lib.locator('.wp-cell')).toHaveCount(6);
    await expect(lib.getByRole('button', { name: 'Collage with my favorites' })).toHaveCount(0);

    await lib.getByRole('button', { name: /^Sort:/ }).click();
    const sort = sheet(page, 'Sort favorites');
    await expect(sort.locator('.list-item')).toHaveText([
      /^Date added\s*Most recently added first$/,
      /^Color\s*Red to pink, then grays$/,
      /^Source\s*Unsplash, Pexels… grouped$/,
      /^Name\s*Alphabetical order$/,
    ]);
    await sort.getByRole('button', { name: /^Name/ }).click();
    await expect(lib.getByRole('button', { name: 'Sort: name' })).toBeVisible();

    // Appui long : la feuille des étiquettes.
    const cell = lib.locator('.wp-cell').first();
    await cell.hover();
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    const tags = sheet(page, 'Tags');
    await expect(tags).toBeVisible();
    await expect(tags.getByRole('group', { name: 'Tags on this wallpaper' }).getByRole('button', { name: /^Remove tag / })).toHaveCount(1);
    await expect(tags.getByLabel('New tag')).toBeVisible();
    await expect(tags.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await expect(tags.getByRole('heading', { name: 'Already used' })).toBeVisible();
    await expect(tags.getByRole('group', { name: 'Tags already in use' })).toBeVisible();
    await tags.getByLabel('New tag').fill('dune');
    await tags.getByLabel('New tag').press('Enter');
    await expect(tags.getByRole('button', { name: 'Remove tag dune' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('collections, collections automatiques, historique', async ({ page }) => {
    await mockApis(page);
    await page.clock.setFixedTime(NOW);
    await page.goto('/');
    await restore(page, backup(NOW));
    await switchToEnglish(page);
    await goTo(page, 'library');
    const lib = screen(page);

    await lib.getByRole('radio', { name: 'Collections' }).click();
    await expect(lib.getByRole('button', { name: 'New collection' })).toBeVisible();
    await expect(lib.getByRole('button', { name: 'Paste a code' })).toBeVisible();
    await expect(lib.getByRole('button', { name: 'Scan a QR code' })).toBeVisible();
    await expect(lib.getByRole('button', { name: /^Escapade\s*3 wallpapers$/ })).toBeVisible();
    await expect(lib.getByRole('heading', { name: 'Automatic collections' })).toBeVisible();
    const card = (name: string, count: string) => lib.getByRole('button', { name: new RegExp(`^${name}\\s*${count}$`) });
    await expect(card('Recently applied', '3 wallpapers')).toBeVisible();
    await expect(card('Never applied', '4 wallpapers')).toBeVisible();
    await expect(card('Blue', '2 wallpapers')).toBeVisible();
    await expect(card('Red', '1 wallpaper')).toBeVisible();
    await expect(card('Pexels', '2 wallpapers')).toBeVisible();
    await expect(card('Phone gallery', '1 wallpaper')).toBeVisible();

    // Nouvelle collection.
    await lib.getByRole('button', { name: 'New collection' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'New collection' });
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
    await dialog.getByLabel('Name').fill('Montagnes');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(lib.getByRole('button', { name: /^Montagnes\s*0 wallpapers$/ })).toBeVisible();

    // Une collection automatique : calculée, partageable, ni renommable ni supprimable.
    await card('Never applied', '4 wallpapers').click();
    await expect(overlay(page).getByRole('heading', { name: 'Never applied' })).toBeVisible();
    await expect(overlay(page).getByText('Automatic collection: favorites and collections not in your history. It updates itself.')).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(4);
    await expect(overlay(page).getByRole('button', { name: 'Share collection' })).toBeVisible();
    await expect(overlay(page).getByRole('button', { name: 'Rename' })).toHaveCount(0);
    await expect(overlay(page).getByRole('button', { name: 'Back' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Une collection de l'utilisateur, vide : renommer et supprimer.
    await lib.getByRole('button', { name: /^Montagnes/ }).click();
    await expect(overlay(page).getByText('Empty collection')).toBeVisible();
    await expect(overlay(page).getByText('Add wallpapers from their preview.')).toBeVisible();
    await overlay(page).getByRole('button', { name: 'Rename' }).click();
    const rename = page.getByRole('alertdialog', { name: 'Rename' });
    await expect(rename.getByRole('button', { name: 'Save' })).toBeEnabled();
    await rename.getByLabel('Name').fill('Sommets');
    await rename.getByRole('button', { name: 'Save' }).click();
    await expect(overlay(page).getByRole('heading', { name: 'Sommets' })).toBeVisible();
    await overlay(page).getByRole('button', { name: 'Delete collection' }).click();
    const remove = page.getByRole('alertdialog', { name: 'Delete collection?' });
    await expect(remove.getByText('The wallpapers stay in your favorites and history.')).toBeVisible();
    await remove.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(lib.getByRole('button', { name: /^Sommets/ })).toHaveCount(0);

    // Historique : « Yesterday », entrées automatiques, retour au fond précédent, effacement.
    await lib.getByRole('radio', { name: 'History' }).click();
    await expect(lib.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
    await expect(lib.getByRole('button', { name: 'Revert to previous wallpaper' })).toBeVisible();
    const yesterday = lib.locator('section').filter({ has: page.getByRole('heading', { name: 'Yesterday' }) });
    await expect(yesterday.locator('.list-item')).toContainText(['Home and lock screens']);
    await expect(yesterday.locator('.list-item')).toContainText([/\d{2}:\d{2} · automatic$/]);
    await lib.getByRole('button', { name: 'Clear history', exact: true }).click();
    const clear = page.getByRole('alertdialog', { name: 'Clear history?' });
    await expect(clear.getByText('Wallpapers already applied won’t change.')).toBeVisible();
    await clear.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(lib.getByText('No history yet')).toBeVisible();
    await expect(lib.getByText('Wallpapers you apply will show up here.')).toBeVisible();
  });

  test('statistiques', async ({ page }) => {
    await mockApis(page);
    await page.clock.setFixedTime(NOW);
    await page.goto('/');
    await restore(page, backup(NOW));
    await switchToEnglish(page);
    await goTo(page, 'library');
    await screen(page).getByRole('button', { name: 'Statistics' }).click();
    const stats = overlay(page);

    await expect(stats.getByRole('heading', { name: 'Statistics' })).toBeVisible();
    await expect(stats.getByText('5 wallpapers applied', { exact: true })).toBeVisible();
    await expect(stats.getByText(/^since \d{1,2} \p{L}+ \d{4}, including 2 automatic$/u)).toBeVisible();
    await expect(stats.getByRole('heading', { name: 'Most applied' })).toBeVisible();
    await expect(stats.getByRole('heading', { name: 'Time on screen' })).toBeVisible();
    await expect(stats.getByRole('heading', { name: 'By source' })).toBeVisible();

    const top = stats.locator('section[aria-labelledby="stats-top"] .stat-row');
    await expect(top.nth(0)).toContainText('Brume bleue');
    await expect(top.nth(0)).toContainText('3×');
    const time = stats.locator('section[aria-labelledby="stats-time"] .stat-row');
    await expect(time.nth(0)).toContainText('6 d');
    const sources = stats.locator('section[aria-labelledby="stats-source"] .stat-row');
    await expect(sources.nth(0)).toContainText('Unsplash');
    await expect(sources.nth(0)).toContainText('80%');
    await expect(sources.nth(0)).toContainText('4 wallpapers applied · 7 d');
    await expect(stats.getByText(/^Based on your history \(up to 200 entries, automations included\)\./)).toBeVisible();
  });

  test('bibliothèque vide : messages d’accueil', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);
    await goTo(page, 'library');
    const lib = screen(page);
    await expect(lib.getByText('No favorites', { exact: true })).toBeVisible();
    await expect(lib.getByText('Tap the heart in a wallpaper’s preview to find it here, even offline.')).toBeVisible();
    await lib.getByRole('radio', { name: 'Collections' }).click();
    await expect(lib.getByText('No collections', { exact: true })).toBeVisible();
    await lib.getByRole('radio', { name: 'History' }).click();
    await expect(lib.getByText('No history yet')).toBeVisible();
    await lib.getByRole('button', { name: 'Statistics' }).click();
    await expect(overlay(page).getByText('No statistics yet')).toBeVisible();
    await expect(overlay(page).getByText('Wallpapers you apply, manually or automatically, will be counted here.')).toBeVisible();
  });

  test('partage : lien, code, QR code, message ; réception d’une collection', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockApis(page);
    await mockById(page, ['unsplash:brume']);
    await page.clock.setFixedTime(NOW);
    await page.goto('/');
    await restore(page, backup(NOW));
    await switchToEnglish(page);
    await goTo(page, 'library');
    const lib = screen(page);

    await lib.getByRole('radio', { name: 'Collections' }).click();
    await lib.getByRole('button', { name: /^Escapade/ }).click();
    await overlay(page).getByRole('button', { name: 'Share collection' }).click();
    const share = sheet(page, 'Share “Escapade”');
    await expect(share.getByText(/^2 wallpapers shared\. No account needed: the code only contains the name and the list of wallpapers/)).toBeVisible();
    await expect(share.getByText('1 wallpaper isn’t included: it was imported from the gallery or created in Prisme, so its image stays on this phone.')).toBeVisible();
    await expect(share.getByRole('img', { name: 'Collection QR code' })).toBeVisible();
    await expect(share.getByText('Or have it scanned: Library › Collections › Scan a QR code.')).toBeVisible();

    await share.getByRole('button', { name: 'Share link' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeSystemWeb?.sharedTexts.length ?? 0)).toBe(1);
    const shared = await page.evaluate(() => window.__prismeSystemWeb?.sharedTexts[0]);
    expect(shared?.title).toBe('Prisme collection: Escapade');
    const text = shared?.text ?? '';
    expect(text).toContain('I’m sharing my collection “Escapade” (2 wallpapers) with you on Prisme.');
    expect(text).toContain('To add it to your library, open this link on a phone that has Prisme installed:');
    expect(text).toContain('then in Prisme go to Library › Collections › Paste a code.');
    const link = /prisme:\/\/collection\/[A-Za-z0-9_-]+/.exec(text)?.[0] ?? '';
    expect(link).not.toBe('');

    await share.getByRole('button', { name: 'Copy code' }).click();
    await expect(snackbar(page, 'Code copied: paste it into “Paste a code”')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Coller un code : erreur lisible, puis le message entier est accepté.
    await lib.getByRole('button', { name: 'Paste a code' }).click();
    const paste = page.getByRole('alertdialog', { name: 'Paste a code' });
    await expect(paste.getByText('Code, link or share message')).toBeVisible();
    await expect(paste.getByText('Paste what you received: the whole message works too.')).toBeVisible();
    await expect(paste.getByRole('button', { name: 'Open' })).toBeDisabled();
    await paste.getByRole('textbox').fill('hello, here is my collection of wallpapers');
    await paste.getByRole('button', { name: 'Open' }).click();
    await expect(paste.getByRole('alert')).toHaveText('This code isn’t a Prisme collection');
    await paste.getByRole('textbox').fill(text);
    await paste.getByRole('button', { name: 'Open' }).click();

    // Collection reçue : un fond a disparu chez sa source.
    const received = overlay(page);
    await expect(received.getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await expect(received.getByText('Received collection · 2 wallpapers')).toBeVisible();
    await expect(received.getByText('1 wallpaper found, 1 not found (removed by its source).')).toBeVisible();
    await received.getByRole('button', { name: 'Add to my library' }).click();
    await expect(snackbar(page, 'Collection “Escapade” added to your library')).toBeVisible();
    await expect(overlay(page).getByRole('heading', { name: 'Escapade' })).toBeVisible();
    await expect(overlayCells(page)).toHaveCount(1);

    // Lien ouvert depuis l'extérieur, abîmé : message.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__prismeLibraryWeb?.triggerLink('prisme://collection/ceciNestPasUnCodeDeCollection'));
    await expect(snackbar(page, 'This code isn’t a Prisme collection')).toBeVisible();

    // Scanner : sans services Google Play, le code collé reste possible.
    await page.evaluate(() => {
      if (window.__prismeLibraryWeb) window.__prismeLibraryWeb.nextScan = 'https://example.com/une-adresse-tres-longue-qui-ne-vient-pas-de-prisme';
    });
    await lib.getByRole('button', { name: 'Scan a QR code' }).click();
    await expect(snackbar(page, 'This code isn’t a Prisme collection')).toBeVisible();
  });
});

test.describe('collage en anglais', () => {
  test('dispositions, cases, réglages, fond, enregistrement', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    // Quatre favoris, puis l'option « Générateur de fonds » (elle active le collage).
    for (let i = 0; i < 4; i++) {
      await screen(page).locator('.wp-cell').nth(i).click();
      await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
      await page.keyboard.press('Escape');
    }
    await enableFeature(page, 'Générateur de fonds');
    await switchToEnglish(page);
    await goTo(page, 'library');
    await screen(page).getByRole('button', { name: 'Collage with my favorites' }).click();

    const collage = page.getByRole('dialog', { name: 'Collage' });
    const slot = (n: number) => collage.getByRole('button', { name: new RegExp(`^Slot ${n}:`) });
    await expect(collage.getByRole('heading', { name: 'Collage' })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Close collage' })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Reset' })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(collage.getByLabel('Collage preview')).toBeVisible();

    // Quatre photos : grille 2×2 d'emblée ; les cases remplies, puis le conseil d'utilisation.
    const layouts = collage.getByRole('radiogroup', { name: 'Layout' });
    await expect(layouts.getByRole('radio', { name: 'Four photos in a 2×2 grid' })).toHaveAttribute('aria-checked', 'true');
    await expect(layouts.getByRole('radio')).toHaveCount(9);
    for (const label of ['Top / bottom', 'Side by side', 'Polaroids', 'Strips', 'Grid']) await expect(layouts.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(layouts.getByRole('radio', { name: 'Two photos, one above the other' })).toBeVisible();
    await expect(layouts.getByRole('radio', { name: 'Three photos, one large and two small' })).toBeVisible();
    await expect(layouts.getByRole('radio', { name: 'Four scattered Polaroids' })).toBeVisible();
    await expect(collage.getByText('Tap a slot to edit it. Drag, pinch or use the scroll wheel to frame its photo.')).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Save' })).toBeEnabled();

    // Une case : ses actions, puis une case vide.
    await slot(1).click();
    await expect(collage.getByText('Slot 1', { exact: true })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Change photo' })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Swap with another slot' })).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Recenter photo' })).toBeDisabled();
    await collage.getByRole('button', { name: 'Swap with another slot' }).click();
    await expect(collage.getByText('Tap the slot to swap with slot 1.')).toBeVisible();
    await collage.getByRole('button', { name: 'Cancel' }).click();
    await slot(4).click();
    await collage.getByRole('button', { name: 'Remove photo' }).click();
    await expect(slot(4)).toHaveAccessibleName('Slot 4: empty, add a photo');
    await expect(slot(4)).toContainText('Add');
    await expect(collage.getByText('3 of 4 slots filled: tap an empty slot to add a photo.')).toBeVisible();
    await expect(collage.getByRole('button', { name: 'Save' })).toBeDisabled();
    await slot(4).click();
    await expect(page.getByRole('dialog', { name: 'Choose a photo' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Choose a photo' }).locator('.picker__item').first().click();
    await expect(slot(4)).not.toHaveAccessibleName(/empty/);

    // Outils : réglages et couleur de fond.
    const tools = collage.getByRole('tablist', { name: 'Tools' });
    await expect(tools.getByRole('tab')).toHaveText(['Layout', 'Settings', 'Background']);
    await tools.getByRole('tab', { name: 'Settings' }).click();
    await expect(collage.getByRole('slider', { name: 'Spacing' })).toBeVisible();
    await collage.getByRole('slider', { name: 'Rounded corners' }).fill('24');
    await expect(collage.getByText('24 px')).toBeVisible();
    await tools.getByRole('tab', { name: 'Background' }).click();
    const colors = collage.getByRole('radiogroup', { name: 'Background color' });
    await expect(colors.getByRole('radio', { name: 'Black' })).toHaveAttribute('aria-checked', 'true');
    await colors.getByRole('radio', { name: 'White' }).click();
    await expect(colors.getByRole('radio', { name: 'White' })).toHaveAttribute('aria-checked', 'true');
    await expect(colors.getByRole('radio', { name: 'Dominant color of photo 1' })).toBeVisible();
    await expect(colors.getByRole('radio', { name: 'Material You: primary color' })).toBeVisible();

    // Enregistrement : la création est rangée dans la collection « Creations ».
    await collage.getByRole('button', { name: 'Save' }).click();
    const saved = page.getByRole('status').filter({ hasText: 'Saved to the “Creations” collection' });
    await expect(saved).toBeVisible();
    await expect(saved.getByRole('button', { name: 'View' })).toBeVisible();
    await collage.getByRole('button', { name: 'Close collage' }).click();
    await expect(collage).toBeHidden();
    await screen(page).getByRole('radio', { name: 'Collections' }).click();
    const creations = screen(page).getByRole('button', { name: /^Creations\s*1 wallpaper$/ });
    await expect(creations).toBeVisible();
    await creations.click();
    await expect(overlayCells(page)).toHaveCount(1);
    await expect(overlayCells(page).first()).toHaveAttribute('aria-label', /Collage of 4 photos/);
  });
});

test.describe('éditeur en anglais', () => {
  test('outils, panneaux et enregistrement', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await enableFeature(page, 'Éditeur');
    await switchToEnglish(page);
    await goTo(page, 'explore');
    await screen(page).locator('.wp-cell').first().click();
    const preview = page.locator('.preview');
    await preview.locator('.preview__top button').last().click();
    // Le bouton de l'aperçu (autre écran) s'appelle « Retoucher », ou « Edit » une fois traduit : même clé que le titre de l'éditeur.
    await page.getByRole('button', { name: /^(Retoucher|Edit)/ }).click();

    const editor = page.getByRole('dialog', { name: 'Editor' });
    await expect(editor.locator('.editor__loading')).toHaveCount(0);
    await expect(editor.getByRole('heading', { name: 'Edit' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Close editor' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(editor.getByRole('button', { name: 'Reset' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(editor.getByLabel('Edit preview')).toBeVisible();

    const tools = editor.getByRole('tablist', { name: 'Tools' });
    await expect(tools.getByRole('tab')).toHaveText(['Crop', 'Fit', 'Filters', 'Effects', 'Blur', 'Darken', 'Grain', 'Gradient', 'Text']);
    await expect(editor.getByRole('slider', { name: 'Blur intensity' })).toBeVisible();

    // Recadrage : les degrés et le zoom s'écrivent avec un point décimal.
    await tools.getByRole('tab', { name: 'Crop' }).click();
    await expect(editor.getByRole('button', { name: 'Rotate left' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Rotate right' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Flip horizontally' })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Reset crop' })).toBeVisible();
    await editor.getByRole('slider', { name: 'Straighten' }).fill('3.5');
    await expect(editor.getByText('+3.5°')).toBeVisible();
    await expect(editor.getByRole('slider', { name: 'Zoom' })).toBeVisible();
    await expect(editor.getByText('Drag the photo to move it, pinch or use the scroll wheel to zoom.')).toBeVisible();

    // Ajustement.
    await tools.getByRole('tab', { name: 'Fit' }).click();
    const fit = editor.getByRole('group', { name: 'Photo fit' });
    await expect(fit.getByRole('button')).toHaveText(['Fill (crop)', 'Whole, blurred edges', 'Whole, dominant color']);
    await fit.getByRole('button', { name: 'Whole, dominant color' }).click();
    const edges = editor.getByRole('radiogroup', { name: 'Edge color' });
    await expect(edges.getByRole('radio', { name: 'Dominant color' })).toHaveAttribute('aria-checked', 'true');
    await expect(edges.getByRole('radio', { name: 'Black' })).toBeVisible();
    await expect(edges.getByRole('radio', { name: 'White' })).toBeVisible();
    await expect(editor.getByLabel('Custom color')).toBeVisible();
    await tools.getByRole('tab', { name: 'Crop' }).click();
    await expect(editor.getByText('Moving and zooming only work with “Fill (crop)”.')).toBeVisible();

    // Filtres, dont le duotone.
    await tools.getByRole('tab', { name: 'Filters' }).click();
    const filters = editor.getByRole('group', { name: 'Photo filters' });
    await expect(filters.getByRole('button')).toHaveText(['None', 'Black & white', 'Sepia', 'Vintage', 'Duotone', 'Contrast', 'Cool', 'Warm']);
    await expect(editor.getByRole('slider', { name: 'Filter intensity' })).toBeDisabled();
    await filters.getByRole('button', { name: 'Duotone' }).click();
    await expect(editor.getByRole('slider', { name: 'Filter intensity' })).toBeEnabled();
    const presets = editor.getByRole('group', { name: 'Duotone presets' });
    for (const name of ['Dusk', 'Ocean', 'Forest', 'Ember', 'Orchid', 'Ice']) await expect(presets.getByRole('button', { name: `Preset ${name}` })).toBeVisible();
    await expect(editor.getByLabel('Shadow color')).toBeVisible();
    await expect(editor.getByLabel('Highlight color')).toBeVisible();

    // Effets artistiques.
    await tools.getByRole('tab', { name: 'Effects' }).click();
    const effects = editor.getByRole('group', { name: 'Art effects' });
    await expect(effects.getByRole('button')).toHaveText(['None', 'Pixel art', 'Mosaic', 'Halftone', 'Painting']);
    await effects.getByRole('button', { name: 'Mosaic' }).click();
    await expect(editor.getByRole('slider', { name: 'Tile size' })).toBeVisible();
    await effects.getByRole('button', { name: 'Halftone' }).click();
    await expect(editor.getByRole('slider', { name: 'Halftone size' })).toBeVisible();
    await effects.getByRole('button', { name: 'Painting' }).click();
    await expect(editor.getByRole('slider', { name: 'Painting intensity' })).toBeVisible();
    await effects.getByRole('button', { name: 'Pixel art' }).click();
    await expect(editor.getByRole('slider', { name: 'Pixel size' })).toBeVisible();

    // Flou, assombrissement, dégradé, texte.
    await tools.getByRole('tab', { name: 'Darken' }).click();
    await expect(editor.getByRole('slider', { name: 'Darkening' })).toBeVisible();
    await tools.getByRole('tab', { name: 'Gradient' }).click();
    await editor.getByRole('button', { name: 'Top' }).click();
    await expect(editor.getByRole('radiogroup', { name: 'Gradient color' })).toBeVisible();
    await expect(editor.getByRole('slider', { name: 'Gradient strength' })).toBeVisible();
    await expect(editor.locator('.chip-wrap').getByRole('button')).toHaveText(['None', 'Top', 'Bottom', 'Vignette']);
    await tools.getByRole('tab', { name: 'Text' }).click();
    await editor.getByPlaceholder('Your text').fill('Hello');
    await expect(editor.getByRole('slider', { name: 'Text size' })).toBeVisible();
    await expect(editor.getByRole('slider', { name: 'Vertical position' })).toBeVisible();
    await expect(editor.getByRole('radiogroup', { name: 'Text color' })).toBeVisible();
    await expect(editor.getByRole('switch', { name: 'Bold text' })).toBeVisible();
    await expect(editor.getByText('Bold', { exact: true })).toBeVisible();

    // Enregistrement : rangé dans la collection « Creations ».
    await editor.getByRole('button', { name: 'Save' }).click();
    const saved = page.getByRole('status').filter({ hasText: 'Saved to the “Creations” collection' });
    await expect(saved).toBeVisible();
    await expect(saved.getByRole('button', { name: 'View' })).toBeVisible();
  });
});
