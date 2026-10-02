import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const topOverlay = (page: Page) => page.locator('.overlay-layer').last();
const overlayCells = (page: Page) => topOverlay(page).locator('.wp-cell');
const preview = (page: Page) => page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });
const categories = (page: Page) => page.getByRole('navigation', { name: 'Catégories' });
const web = <T,>(page: Page, read: () => T) => page.evaluate(read);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return page.locator('.tab[data-active="true"]');
}

async function moreActions(page: Page) {
  await preview(page).getByRole('button', { name: 'Plus d’actions' }).click();
}

test.describe('sources', () => {
  test('Tendances et Nouveautés mêlent Unsplash et Wallhaven', async ({ page }) => {
    const log = await mockApis(page, { wallhaven: true });
    await page.goto('/');
    await categories(page).getByRole('button', { name: 'Tendances' }).click();
    await expect(cells(page).filter({ has: page.locator('img[src*="wallhaven.cc"]') }).first()).toBeVisible();
    expect(log.unsplash.some((u) => u.pathname === '/topics/wallpapers/photos' && u.searchParams.get('order_by') === 'popular')).toBe(true);
    const toplist = log.wallhaven.find((u) => u.searchParams.get('sorting') === 'toplist');
    expect(toplist?.searchParams.get('purity')).toBe('100');
    expect(toplist?.searchParams.get('ratios')).toBe('portrait');

    await categories(page).getByRole('button', { name: 'Nouveautés' }).click();
    await expect.poll(() => log.wallhaven.some((u) => u.searchParams.get('sorting') === 'date_added')).toBe(true);
    expect(log.unsplash.some((u) => u.searchParams.get('order_by') === 'latest')).toBe(true);

    // Fond Wallhaven : source affichée, pas de licence annoncée.
    await cells(page).filter({ has: page.locator('img[src*="wallhaven.cc"]') }).first().click();
    await expect(preview(page).getByText('Wallhaven', { exact: true })).toBeVisible();
    await moreActions(page);
    await page.getByRole('button', { name: /Informations/ }).click();
    await expect(page.getByRole('link', { name: /Voir sur Wallhaven/ })).toBeVisible();
    await expect(page.getByText(/Licence/)).toHaveCount(0);
  });

  test('Art (musée) et Espace (NASA)', async ({ page }) => {
    const log = await mockApis(page, { art: true, nasa: true });
    await page.goto('/');
    await categories(page).getByRole('button', { name: 'Art' }).click();
    await expect(cells(page).first()).toBeVisible();
    const art = log.art[0];
    expect(art?.searchParams.get('type')).toBe('Painting');
    expect(art?.searchParams.get('cc0')).toBe('1');

    await cells(page).first().click();
    await expect(preview(page).getByText('Œuvre : Frederic Edwin Church · Cleveland Museum of Art')).toBeVisible();
    await moreActions(page);
    await page.getByRole('button', { name: /Informations/ }).click();
    await expect(page.getByText('Artiste', { exact: true })).toBeVisible();
    await expect(page.getByText('Domaine public (CC0)')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await categories(page).getByRole('button', { name: 'Espace' }).click();
    await expect.poll(() => log.nasa.map((u) => u.searchParams.get('q'))).toEqual(expect.arrayContaining(['nebula', 'galaxy']));
    // Image sans dimensions connues : mesurée à l'ouverture, l'aperçu se rabat sur l'original.
    await page.locator('.tab[data-active="true"] .wp-cell[aria-label^="Nébuleuse nebula1,"]').click();
    await expect(preview(page).getByText(/Crédit : NASA GSFC · NASA/)).toBeVisible();
    await expect(preview(page).locator('.preview__image')).toHaveAttribute('src', /~orig\.png/);
    await expect(preview(page).getByRole('button', { name: 'Appliquer' })).toBeEnabled();
  });

  test('réglages des sources : Wallhaven coupé, Pixabay activé', async ({ page }) => {
    const log = await mockApis(page, { wallhaven: true, pixabay: true });
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('switch', { name: 'Wallhaven' }).click();
    const pixabay = settings.getByRole('switch', { name: 'Pixabay' });
    await expect(pixabay).toHaveAttribute('aria-checked', 'false');
    await pixabay.click();

    const before = log.wallhaven.length;
    await page.getByRole('button', { name: 'Explorer' }).click();
    await categories(page).getByRole('button', { name: 'Tendances' }).click();
    await expect(cells(page).filter({ has: page.locator('img[src*="cdn.pixabay.com"]') }).first()).toBeVisible();
    expect(log.wallhaven.length).toBe(before);
    const query = log.pixabay.at(-1);
    expect(query?.searchParams.get('key')).toBe('e2e-pixabay');
    expect(query?.searchParams.get('safesearch')).toBe('true');
  });
});

test.describe('découverte', () => {
  test('fond du jour : carte, notification et ouverture depuis la notification', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const card = page.getByRole('button', { name: /^Fond du jour :/ });
    await expect(card).toBeVisible();
    const label = await card.getAttribute('aria-label');
    await card.click();
    await expect(preview(page)).toBeVisible();
    await page.keyboard.press('Escape');

    const settings = await openSettings(page);
    await settings.getByRole('switch', { name: 'Notification « Fond du jour »' }).click();
    await expect(snackbar(page, 'Fond du jour chaque jour à 9 h')).toBeVisible();
    await settings.getByRole('button', { name: '7 h' }).click();
    await expect.poll(() => web(page, () => window.__prismeSystemWeb?.dailyCalls.at(-1))).toEqual({ enabled: true, hour: 7, prompt: true });
    await expect(settings.getByText('Chaque jour à 7 h')).toBeVisible();

    // Notification touchée : l'app ouvre le même fond du jour.
    await page.evaluate(() => window.__prismeSystemWeb?.triggerAction('DAILY'));
    await expect(preview(page)).toBeVisible();
    expect(label).toContain(await preview(page).locator('.preview__image').getAttribute('alt'));
  });

  test('notification refusée : l’option reste coupée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.evaluate(() => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.notificationPermission = 'denied';
    });
    const settings = await openSettings(page);
    const toggle = settings.getByRole('switch', { name: 'Notification « Fond du jour »' });
    await toggle.click();
    await expect(snackbar(page, 'Notifications refusées')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await web(page, () => window.__prismeSystemWeb?.dailyCalls.at(-1)?.enabled)).toBe(false);
  });

  test('nuancier et filtre AMOLED', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Filtres' }).click();
    await page.getByRole('button', { name: 'Nuancier' }).click();
    const shade = page.getByRole('radio', { name: /^Teinte #/ }).nth(8);
    const name = (await shade.getAttribute('aria-label')) ?? '';
    await shade.click();
    await page.getByRole('button', { name: 'Appliquer' }).click();
    const hex = name.replace('Teinte ', '').toLowerCase();
    await expect(page.getByRole('button', { name: `Retirer le filtre ${name}` })).toBeVisible();
    await expect.poll(() => log.pexels.some((u) => u.pathname.endsWith('/search') && u.searchParams.get('color') === hex)).toBe(true);

    await page.getByRole('button', { name: 'Filtres' }).click();
    await page.getByRole('switch', { name: 'AMOLED' }).click();
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByRole('button', { name: 'Retirer le filtre AMOLED' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Retirer le filtre ${name}` })).toHaveCount(0);
    await expect.poll(() => log.unsplash.some((u) => u.pathname === '/search/photos' && u.searchParams.get('color') === 'black')).toBe(true);
    await expect(cells(page).first()).toBeVisible();
  });

  test('masquer un fond, un photographe et un sujet, puis réafficher', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const graceCells = page.locator('.tab[data-active="true"] .wp-cell[aria-label*="Grace Hopper"]');
    await expect(graceCells.first()).toBeVisible();

    // Un fond.
    const first = cells(page).first();
    const firstName = (await first.getAttribute('aria-label')) ?? '';
    await first.click();
    await moreActions(page);
    await page.getByRole('button', { name: /Ne plus voir/ }).click();
    await page.getByRole('button', { name: /^Ce fond/ }).click();
    await expect(snackbar(page, 'Fond masqué')).toBeVisible();
    await expect(preview(page)).toHaveCount(0);
    await expect(page.locator(`.wp-cell[aria-label="${firstName}"]`)).toHaveCount(0);

    // Un photographe.
    await graceCells.first().click();
    await moreActions(page);
    await page.getByRole('button', { name: /Ne plus voir/ }).click();
    await page.getByRole('button', { name: /Les fonds de Grace Hopper/ }).click();
    await expect(snackbar(page, 'Fonds de Grace Hopper masqués')).toBeVisible();
    await expect(graceCells).toHaveCount(0);
    await snackbar(page, 'Fonds de Grace Hopper masqués').getByRole('button', { name: 'Annuler' }).click();
    await expect(graceCells.first()).toBeVisible();

    // Un sujet, depuis les réglages, puis tout réafficher.
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Contenus masqués/ }).click();
    const screen = topOverlay(page);
    await screen.getByLabel('Masquer un sujet').fill('forêt');
    await screen.getByRole('button', { name: 'Ajouter' }).click();
    await expect(screen.getByRole('button', { name: 'Réafficher le sujet forêt' })).toBeVisible();
    await expect(screen.getByRole('button', { name: `Réafficher ${firstName.split(',')[0]}` })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Explorer' }).click();
    await expect(cells(page).first()).toBeVisible();
    await expect(page.locator('.tab[data-active="true"] .wp-cell[aria-label^="forêt"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Réglages' }).click();
    await settings.getByRole('button', { name: /Contenus masqués/ }).click();
    await screen.getByRole('button', { name: 'Tout réafficher' }).click();
    await expect(screen.getByText('Aucun sujet masqué.')).toBeVisible();
  });

  test('« Plus comme ça » : même sujet puis même couleur', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await moreActions(page);
    await page.getByRole('button', { name: /Plus comme ça/ }).click();
    const screen = topOverlay(page);
    await expect(screen.getByRole('heading', { name: 'Plus comme ça' })).toBeVisible();
    await expect(screen.getByText(/^Sujet : montagne/)).toBeVisible();
    await expect(overlayCells(page).first()).toBeVisible();
    expect(log.unsplash.some((u) => u.pathname === '/search/photos' && u.searchParams.get('query')?.startsWith('montagne'))).toBe(true);

    await screen.getByRole('radio', { name: 'Même couleur' }).click();
    await expect.poll(() => log.pexels.some((u) => u.searchParams.get('color') === '#204080')).toBe(true);
    await expect(overlayCells(page).first()).toBeVisible();
  });

  test('« Pour toi » à partir des favoris', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await categories(page).getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText(/Ajoute au moins 3 favoris/)).toBeVisible();

    await categories(page).getByRole('button', { name: 'À la une' }).click();
    for (const i of [0, 2, 4]) {
      await cells(page).nth(i).click();
      await preview(page).getByRole('button', { name: 'Ajouter aux favoris' }).click();
      await page.keyboard.press('Escape');
    }
    await categories(page).getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText(/^D’après tes favoris : montagne/)).toBeVisible();
    await expect(cells(page).first()).toBeVisible();
    expect(log.unsplash.some((u) => u.searchParams.get('query') === 'montagne')).toBe(true);
    expect(log.unsplash.some((u) => u.pathname === '/users/ada/photos')).toBe(true);
    // Les favoris eux-mêmes ne sont pas reproposés.
    await expect(cells(page).locator('.wp-cell__badge')).toHaveCount(0);
  });

  test('suivre un photographe : page dédiée et Abonnements', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await expect(categories(page).getByRole('button', { name: 'Abonnements' })).toHaveCount(0);
    await cells(page).first().click();
    await preview(page).getByRole('button', { name: 'Photo : Ada Lovelace · Unsplash' }).click();

    const screen = topOverlay(page);
    await expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible();
    await expect(screen.getByRole('link', { name: 'Profil Unsplash' })).toHaveAttribute('href', /unsplash\.com\/@ada/);
    await screen.getByRole('button', { name: 'Suivre' }).click();
    await expect(screen.getByRole('button', { name: 'Abonné' })).toBeVisible();
    await expect(overlayCells(page).first()).toBeVisible();
    expect(log.unsplash.some((u) => u.pathname === '/users/ada/photos' && u.searchParams.get('order_by') === 'latest')).toBe(true);

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await categories(page).getByRole('button', { name: 'Abonnements' }).click();
    await expect(page.locator('.tab[data-active="true"]').getByRole('button', { name: 'Ada Lovelace', exact: true })).toBeVisible();
    await expect(cells(page).first()).toBeVisible();
  });
});

test.describe('rotation en ligne', () => {
  const rotation = (page: Page) => page.evaluate(() => window.__prismeAutomationWeb?.config?.rotation);

  test('fonds au hasard en ligne : thème, mot-clé, Wi-Fi et contenus masqués envoyés au natif', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Changement automatique/ }).click();
    const screen = topOverlay(page);
    await screen.getByRole('switch', { name: 'Activer la rotation' }).click();
    await expect(screen.getByRole('button', { name: 'En ligne, au hasard' })).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByText(/^Fonds au hasard en ligne : Fonds d’écran/)).toBeVisible();
    await expect(screen.getByText(/^Sources : Unsplash, Pexels, Wallhaven, Cleveland Museum of Art, NASA/)).toBeVisible();
    await expect.poll(async () => (await rotation(page))?.online?.queries).toEqual([
      { provider: 'unsplash', query: 'wallpaper', auth: 'Client-ID e2e-unsplash' },
      { provider: 'pexels', auth: 'e2e-pexels' },
      { provider: 'wallhaven', query: '', categories: '100' },
    ]);
    expect((await rotation(page))?.items).toEqual([]);
    await expect(screen.getByRole('switch', { name: 'Ordre aléatoire' })).toHaveCount(0);

    await screen.getByRole('button', { name: 'Nature' }).click();
    await expect.poll(async () => (await rotation(page))?.online?.key).toBe('nature:');
    expect((await rotation(page))?.online?.queries).toContainEqual({ provider: 'unsplash', query: 'nature landscape', auth: 'Client-ID e2e-unsplash' });

    await screen.getByRole('button', { name: 'Mot-clé…' }).click();
    await expect(screen.getByText('Saisis un mot-clé pour la rotation en ligne.')).toBeVisible();
    await screen.getByLabel('Mot-clé').fill('aurore');
    await screen.getByLabel('Mot-clé').press('Enter');
    await expect.poll(async () => (await rotation(page))?.online?.key).toBe('custom:aurore');
    await screen.getByRole('switch', { name: 'Uniquement en Wi-Fi' }).click();
    await expect.poll(async () => (await rotation(page))?.online?.wifiOnly).toBe(true);

    await screen.getByRole('button', { name: 'Changer maintenant' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeAutomationWeb?.rotations)).toBe(1);
    await page.keyboard.press('Escape');
    await expect(settings.getByRole('button', { name: /Changement automatique/ })).toContainText('Toutes les 1 h · en ligne, « aurore »');

    // Un sujet masqué n'est jamais choisi par la rotation.
    await settings.getByRole('button', { name: /Contenus masqués/ }).click();
    await topOverlay(page).getByLabel('Masquer un sujet').fill('voiture');
    await topOverlay(page).getByRole('button', { name: 'Ajouter' }).click();
    await expect.poll(async () => (await rotation(page))?.online?.exclude.words).toEqual(['voiture']);
  });

  test('les fonds trouvés en ligne app fermée arrivent dans l’historique', async ({ page }) => {
    await mockApis(page);
    await page.addInitScript(() => {
      window.__prismeAutomationPendingLog = [
        {
          id: 'unsplash:enligne',
          target: 'both',
          at: Date.now() - 60_000,
          reason: 'rotation',
          wallpaper: {
            id: 'unsplash:enligne',
            source: 'unsplash',
            width: 3000,
            height: 6000,
            color: '#204080',
            alt: 'aurore en ligne',
            thumb: 'https://images.unsplash.com/photo-enligne?w=360',
            preview: 'https://images.unsplash.com/photo-enligne?w=1080',
            full: 'https://images.unsplash.com/photo-enligne?w=3000',
            author: { name: 'Hedy Lamarr', url: 'https://unsplash.com/@hedy', username: 'hedy' },
          },
        },
      ];
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    const library = page.locator('.tab[data-active="true"]');
    await library.getByRole('radio', { name: 'Historique' }).click();
    const entry = library.getByRole('button', { name: /Hedy Lamarr · automatique/ });
    await expect(entry).toBeVisible();
    await entry.click();
    await expect(preview(page).getByRole('button', { name: 'Photo : Hedy Lamarr · Unsplash' })).toBeVisible();
  });
});
