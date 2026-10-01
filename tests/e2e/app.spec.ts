import { expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: import('@playwright/test').Page) => page.locator('.wp-cell');

test.describe('galerie', () => {
  test('affiche le thème Wallpapers d’Unsplash et Pexels, puis charge la suite au défilement', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    expect(log.unsplash[0]?.pathname).toBe('/topics/wallpapers/photos');
    expect(log.unsplash[0]?.searchParams.get('orientation')).toBe('portrait');
    expect(log.pexels[0]?.pathname).toBe('/v1/curated');
    await expect(cells(page).first()).toHaveAttribute('aria-label', /par Ada Lovelace/);
    await expect(cells(page).nth(1)).toHaveAttribute('aria-label', /par Grace Hopper/);

    const scroller = page.locator('.tab[data-active="true"] .screen');
    for (let i = 0; i < 12 && log.unsplash.length < 2; i++) {
      await scroller.evaluate((el) => el.scrollBy(0, 4000));
      await page.waitForTimeout(150);
    }
    expect(log.unsplash.some((u) => u.searchParams.get('page') === '2')).toBe(true);
  });

  test('miniatures en basse résolution', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const src = await cells(page).first().locator('img').getAttribute('src');
    const width = Number(new URL(src ?? '').searchParams.get('w'));
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(600);
  });

  test('change de catégorie et filtre par couleur', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Nature' }).click();
    await expect.poll(() => log.unsplash.some((u) => u.pathname === '/topics/nature/photos')).toBe(true);

    await page.getByRole('button', { name: 'Filtres' }).click();
    await page.getByRole('dialog', { name: 'Filtres' }).getByRole('button', { name: 'Bleu' }).click();
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect.poll(() => log.unsplash.some((u) => u.pathname === '/search/photos' && u.searchParams.get('color') === 'blue')).toBe(true);
    await expect.poll(() => log.pexels.some((u) => u.pathname === '/v1/search' && u.searchParams.get('color') === 'blue')).toBe(true);
    await expect(page.getByLabel('Filtres actifs')).toContainText('Bleu');
  });

  test('recherche en français et mémorise la recherche', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Rechercher des fonds' }).click();
    const input = page.getByRole('searchbox', { name: 'Rechercher' });
    await input.fill('montagne');
    await input.press('Enter');
    await expect.poll(() => log.unsplash.find((u) => u.pathname === '/search/photos')?.searchParams.get('query')).toBe('montagne');
    expect(log.unsplash.find((u) => u.pathname === '/search/photos')?.searchParams.get('lang')).toBe('fr');
    await expect(page.locator('.overlay-screen .wp-cell').first()).toBeVisible();

    const search = page.locator('.overlay-screen');
    await search.getByRole('button', { name: 'Effacer' }).click();
    await expect(search.getByRole('button', { name: 'montagne', exact: true })).toBeVisible();
  });

  test('ouvre un pack curé', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Packs' }).click();
    await page.getByRole('button', { name: /Aube/ }).click();
    await expect(page.getByRole('heading', { name: 'Aube' })).toBeVisible();
    await expect.poll(() => log.unsplash.find((u) => u.pathname === '/search/photos')?.searchParams.get('query')).toBe('sunrise mist');
  });
});

test.describe('aperçu et application', () => {
  test('simule les écrans et applique sur le verrouillage en pleine résolution', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    const preview = page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Photo : Ada Lovelace · Unsplash')).toBeVisible();

    await preview.getByRole('radio', { name: 'Simuler l’écran de verrouillage' }).click();
    await expect(preview.locator('.sim-lock__clock')).toBeVisible();
    await preview.getByRole('radio', { name: 'Simuler l’écran d’accueil' }).click();
    await expect(preview.locator('.sim-home__app')).toHaveCount(8);

    // En simulation, les commandes s'effacent ; un appui sur l'image les fait revenir.
    await expect(preview.getByText("Touche l'écran pour afficher les commandes")).toBeVisible();
    await page.getByTestId('preview-stage').click();
    await preview.getByRole('button', { name: 'Appliquer' }).click();
    await page.getByRole('dialog', { name: 'Appliquer sur' }).getByRole('button', { name: 'Écran de verrouillage' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();

    const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.target).toBe('lock');
    expect(applied[0]?.uri).toContain('fm=jpg');
    expect(applied[0]?.crop).toBeUndefined();
    await expect.poll(() => log.downloads.length).toBe(1);
  });

  test('envoie le recadrage choisi par glisser et zoom', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    const stage = page.getByTestId('preview-stage');
    const box = (await stage.boundingBox())!;
    // Double appui : zoom ×2,5 autour du point touché.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect(page.getByRole('button', { name: 'Recentrer' })).toBeVisible();

    await page.getByRole('button', { name: 'Appliquer' }).click();
    await page.getByRole('button', { name: 'Les deux' }).or(page.getByRole('button', { name: 'Accueil et verrouillage' })).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
    const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
    const crop = applied[0]?.crop;
    expect(crop).toBeDefined();
    expect(crop!.width).toBeLessThan(0.5);
    expect(crop!.x).toBeGreaterThanOrEqual(0);
    expect(crop!.y).toBeGreaterThanOrEqual(0);
  });

  test('Échap (retour) ferme la feuille puis l’aperçu', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await page.getByRole('button', { name: 'Informations' }).click();
    await expect(page.getByRole('dialog', { name: 'Informations' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Informations' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Aperçu du fond d’écran' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Aperçu du fond d’écran' })).toBeHidden();
  });
});

test.describe('bibliothèque', () => {
  test('favoris, collections et historique', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await expect(page.getByRole('button', { name: 'Retirer des favoris' })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter à une collection' }).click();
    await page.getByRole('button', { name: 'Nouvelle collection' }).click();
    await page.getByLabel('Nom de la collection').fill('Nuit');
    await page.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Ajouté à « Nuit »' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Appliquer' }).click();
    await page.getByRole('button', { name: "Écran d'accueil" }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    const library = page.locator('.tab[data-active="true"]');
    await expect(library.locator('.wp-cell')).toHaveCount(1);
    await expect(library.locator('.wp-cell__badge')).toHaveCount(1);

    await library.getByRole('radio', { name: 'Collections' }).click();
    await library.getByRole('button', { name: /Nuit/ }).click();
    await expect(page.getByRole('heading', { name: 'Nuit' })).toBeVisible();
    await expect(page.locator('.overlay-screen .wp-cell')).toHaveCount(1);
    await page.keyboard.press('Escape');

    await library.getByRole('radio', { name: 'Historique' }).click();
    await expect(library.getByText("Écran d'accueil")).toBeVisible();
    await expect(library.getByText("Aujourd'hui")).toBeVisible();

    // La bibliothèque survit au rechargement (IndexedDB).
    await page.reload();
    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    await expect(page.locator('.tab[data-active="true"] .wp-cell')).toHaveCount(1);
  });

  test('hors ligne : bannière, flux déjà vus conservés, explication sinon', async ({ page, context }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await context.setOffline(true);
    // Les routes simulées répondraient même hors ligne : on coupe aussi les API.
    await page.route(/https:\/\/api\.(unsplash|pexels)\.com\/.*/, (route) => route.abort('internetdisconnected'));
    await expect(page.getByText('Hors ligne : contenu en cache, favoris et historique disponibles.')).toBeVisible();
    await expect(cells(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Minimal' }).click();
    await expect(page.getByText("Ce contenu n'a pas encore été chargé.", { exact: false })).toBeVisible();
    await context.setOffline(false);
  });

  test('les flux déjà chargés survivent à un redémarrage sans réseau', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await page.waitForTimeout(2500); // le cache des requêtes est écrit dans IndexedDB avec un léger délai
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route(/https:\/\/api\.(unsplash|pexels)\.com\/.*/, (route) => route.abort('internetdisconnected'));
    await page.reload();
    await expect(cells(page).first()).toBeVisible();
    await expect(cells(page).first()).toHaveAttribute('aria-label', /Ada Lovelace/);
  });
});

test.describe('réglages', () => {
  test('thème sombre, colonnes et couleur d’accent', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Réglages' }).click();
    const settings = page.locator('.tab[data-active="true"]');
    await settings.getByRole('radio', { name: 'Sombre' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings.getByRole('radio', { name: '3 colonnes' }).click();
    await settings.getByRole('radio', { name: '#386A20' }).click();
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary'));
    expect(primary.trim()).toMatch(/^#/);

    await page.getByRole('button', { name: 'Explorer' }).click();
    await expect(page.locator('.tab[data-active="true"] .wp-grid__row').first()).toHaveCSS('grid-template-columns', /^\S+ \S+ \S+$/);
  });

  test('le diagnostic applique un fond test', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('button', { name: /Diagnostic/ }).click();
    const diagnostics = page.locator('.overlay-screen');
    await diagnostics.getByRole('button', { name: 'Les deux' }).click();
    await expect(diagnostics.getByText(/Appliqué \(Les deux/)).toBeVisible();
  });
});
