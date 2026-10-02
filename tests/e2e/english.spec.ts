import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.wp-cell');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const settingsTab = (page: Page) => page.locator('.tab[data-active="true"]');

/** Le navigateur de test est en fr-FR : l'anglais se choisit dans Réglages › Langue. */
async function switchToEnglish(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('group', { name: 'Langue' }).getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

test.describe('interface en anglais', () => {
  test('Réglages › Langue : tout passe en anglais, le choix est gardé, on peut revenir au français', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);

    // Barre de navigation et titres de l'écran.
    for (const name of ['Explore', 'Library', 'Settings']) await expect(nav(page).getByRole('button', { name })).toBeVisible();
    const settings = settingsTab(page);
    await expect(settings.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    for (const name of ['Appearance', 'Gallery', 'Discover', 'Applying wallpapers', 'Backup', 'Offline', 'Advanced options', 'About']) {
      await expect(settings.getByRole('heading', { name, level: 2 })).toBeVisible();
    }

    // Lignes, interrupteurs et aides.
    const language = settings.getByRole('group', { name: 'Language' });
    await expect(language.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(language.getByRole('button', { name: 'Phone language' })).toHaveAttribute('aria-pressed', 'false');
    await expect(settings.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' })).toBeVisible();
    await expect(settings.getByRole('switch', { name: 'Haptic feedback' })).toBeVisible();
    await expect(settings.getByText('Light vibration when a wallpaper is applied, saved…')).toBeVisible();
    await expect(settings.getByRole('switch', { name: 'Data saver' })).toBeVisible();
    await expect(settings.getByRole('button', { name: /Check for updates/ })).toBeVisible();

    // Messages : mise à jour, cache.
    await settings.getByRole('button', { name: /Check for updates/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Prisme is up to date' })).toBeVisible();
    await settings.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cache cleared' })).toBeVisible();

    // Le choix survit au rechargement.
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Explore' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Retour au français.
    await nav(page).getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Français' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Réglages' })).toBeVisible();
    await expect(settingsTab(page).getByRole('heading', { name: 'Apparence', level: 2 })).toBeVisible();
  });

  test('écrans secondaires des Réglages : contenus masqués et diagnostic', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);
    const screen = page.locator('.overlay-screen');

    await settingsTab(page).getByRole('button', { name: 'Hidden content' }).click();
    await expect(screen.getByRole('heading', { name: 'Hidden content', level: 1 })).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Topics' })).toBeVisible();
    await expect(screen.getByText('No hidden topics.')).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Photographers and authors' })).toBeVisible();
    await expect(screen.getByText('No hidden wallpapers.')).toBeVisible();
    await screen.getByRole('textbox', { name: 'Hide a topic' }).fill('car');
    await screen.getByRole('button', { name: 'Add' }).click();
    await expect(screen.getByRole('button', { name: 'Unhide topic car' })).toBeVisible();
    await screen.getByRole('button', { name: 'Unhide all' }).click();
    await expect(screen.getByText('No hidden topics.')).toBeVisible();
    await screen.getByRole('button', { name: 'Back' }).click();

    await settingsTab(page).getByRole('button', { name: 'Diagnostics' }).click();
    await expect(screen.getByRole('heading', { name: 'Diagnostics', level: 1 })).toBeVisible();
    for (const name of ['Device', 'Apply a test wallpaper', 'Error log', 'Test log']) {
      await expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    await expect(screen.getByText('Browser (simulation)')).toBeVisible();
    await expect(screen.getByText('No errors recorded.')).toBeVisible();
    await screen.getByRole('button', { name: 'Cache size' }).click();
    await expect(screen.locator('.diagnostics__log li').first()).toContainText('Cache');
    await expect(screen.locator('.diagnostics__log li').first()).toContainText('offline');
  });

  test('Explorer : catégories, filtres et recherche (la requête part en anglais)', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);
    await nav(page).getByRole('button', { name: 'Explore' }).click();
    await expect(cells(page).first()).toBeVisible();

    const categories = page.getByRole('navigation', { name: 'Categories' });
    for (const name of ['Featured', 'For you', 'Trending', 'New', 'Abstract', 'Space', 'Cities', 'Video games']) {
      await expect(categories.getByRole('button', { name })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Search wallpapers' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import from gallery' })).toBeVisible();

    // « Pour toi » sans favoris : explication en anglais.
    await categories.getByRole('button', { name: 'For you' }).click();
    await expect(page.getByText(/Add at least 3 favorites: Prisme will suggest wallpapers/)).toBeVisible();
    await categories.getByRole('button', { name: 'Featured' }).click();

    // Filtres.
    await page.getByRole('button', { name: 'Filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByRole('heading', { name: 'Color' })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Aspect ratio' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Black and white' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'My screen' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Blue' }).click();
    await sheet.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByLabel('Active filters')).toContainText('Blue');
    await page.getByRole('button', { name: 'Remove Blue filter' }).click();
    await expect(page.getByLabel('Active filters')).toHaveCount(0);

    // Recherche : idées en anglais, requête et langue envoyées à l'API en anglais.
    await page.getByRole('button', { name: 'Search wallpapers' }).click();
    const search = page.locator('.overlay-screen');
    const input = search.getByRole('searchbox', { name: 'Search' });
    await expect(input).toHaveAttribute('placeholder', 'Search wallpapers');
    await expect(search.getByRole('heading', { name: 'Ideas' })).toBeVisible();
    await expect(search.getByRole('button', { name: 'Northern lights' })).toBeVisible();
    await search.getByRole('button', { name: 'Rain', exact: true }).click();
    const rain = () => log.unsplash.find((u) => u.pathname === '/search/photos' && u.searchParams.get('query') === 'Rain');
    await expect.poll(() => rain()?.searchParams.get('lang')).toBe('en');
    await expect.poll(() => log.pexels.find((u) => u.pathname === '/v1/search' && u.searchParams.get('query') === 'Rain')?.searchParams.get('locale')).toBe('en-US');
    await expect(search.locator('.wp-cell').first()).toBeVisible();

    await search.getByRole('button', { name: 'Clear' }).click();
    await expect(search.getByRole('heading', { name: 'Recent searches' })).toBeVisible();
    await expect(search.getByRole('button', { name: 'Forget “Rain”' })).toBeVisible();
  });

  test('aperçu : crédit, simulation, application avec annulation, informations', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);
    await nav(page).getByRole('button', { name: 'Explore' }).click();
    await expect(cells(page).first()).toBeVisible();
    await expect(cells(page).first()).toHaveAttribute('aria-label', /, by Ada Lovelace/);

    await cells(page).first().click();
    const preview = page.getByRole('dialog', { name: 'Wallpaper preview' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Photo: Ada Lovelace · Unsplash')).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Add to favorites' })).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Share' })).toBeVisible();

    await preview.getByRole('radio', { name: 'Simulate the lock screen' }).click();
    await expect(preview.locator('.sim-lock__clock')).toBeVisible();
    // La date simulée est écrite en anglais (« Monday 2 October » et non « lundi 2 octobre »).
    await expect(preview.locator('.sim-lock__date')).toHaveText(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
    await expect(preview.getByText('Tap the screen to show the controls')).toBeVisible();
    await page.getByTestId('preview-stage').click();
    await preview.getByRole('radio', { name: 'Image only' }).click();

    await preview.getByRole('button', { name: 'Apply' }).click();
    const sheet = page.getByRole('dialog', { name: 'Apply to' });
    for (const name of ['Home screen', 'Lock screen', 'Home and lock screens']) {
      await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await sheet.getByRole('button', { name: 'Lock screen', exact: true }).click();
    const snackbar = page.getByRole('status').filter({ hasText: 'Wallpaper applied: lock screen' });
    await expect(snackbar).toBeVisible();
    await expect(snackbar.getByRole('button', { name: 'Undo' })).toBeVisible();
    expect((await page.evaluate(() => window.__prismeWeb?.applied ?? [])).map((a) => a.target)).toEqual(['lock']);
    await expect.poll(() => log.downloads.length).toBe(1);

    // Favori et menu « Plus d’actions ».
    await preview.getByRole('button', { name: 'Add to favorites' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to favorites' })).toBeVisible();
    await preview.getByRole('button', { name: 'More actions' }).click();
    const more = page.getByRole('dialog', { name: 'More actions' });
    for (const name of ['More like this', 'Save to gallery', 'Info', 'Hide…']) await expect(more.getByRole('button', { name })).toBeVisible();

    await more.getByRole('button', { name: 'Info' }).click();
    const info = page.getByRole('dialog', { name: 'Info' });
    await expect(info.getByText('Photographer')).toBeVisible();
    await expect(info.getByRole('link', { name: /View on Unsplash/ })).toBeVisible();
    await expect(info.getByText('Original resolution')).toBeVisible();
    await expect(info.getByRole('link', { name: /Unsplash License/ })).toBeVisible();
    await expect(info.getByText('Free to use')).toBeVisible();
    await page.keyboard.press('Escape');

    await preview.getByRole('button', { name: 'More actions' }).click();
    await more.getByRole('button', { name: 'Hide…' }).click();
    const hide = page.getByRole('dialog', { name: 'Hide' });
    await expect(hide.getByRole('button', { name: 'This wallpaper' })).toBeVisible();
    await expect(hide.getByRole('button', { name: /Wallpapers by Ada Lovelace/ })).toBeVisible();
    await hide.getByRole('button', { name: /Wallpapers by Ada Lovelace/ }).click();
    const hidden = page.getByRole('status').filter({ hasText: 'Wallpapers by Ada Lovelace hidden' });
    await expect(hidden).toBeVisible();
    await expect(hidden.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('un échec de chargement s’affiche en anglais, avec le message de la source', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await switchToEnglish(page);
    // Les trois sources du thème répondent par une erreur serveur (les dernières routes déclarées priment).
    for (const url of ['https://api.unsplash.com/**', 'https://api.pexels.com/**', 'https://wallhaven.cc/api/**']) {
      await page.route(url, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    }
    await nav(page).getByRole('button', { name: 'Explore' }).click();
    await page.getByRole('navigation', { name: 'Categories' }).getByRole('button', { name: 'Nature' }).click();

    const empty = page.locator('.empty-state');
    await expect(empty.getByText("Couldn't load")).toBeVisible({ timeout: 20_000 });
    await expect(empty.getByText('Unsplash error (500)')).toBeVisible();
    await expect(empty.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});

const RELEASE = {
  tag_name: 'v0.2.0',
  body: '## Nouveautés\n- Tuile « Fond suivant »\n- Sauvegarde et restauration',
  html_url: 'https://github.com/Karelisio/Prisme/releases/tag/v0.2.0',
  published_at: '2026-10-02T08:00:00Z',
  assets: [
    {
      name: 'Prisme-0.2.0.99.apk',
      size: 3_900_000,
      browser_download_url: 'https://github.com/Karelisio/Prisme/releases/download/v0.2.0/Prisme-0.2.0.99.apk',
    },
  ],
};

test.describe('mises à jour en anglais', () => {
  test('proposition au démarrage, feuille, autorisation d’installer, « Plus tard »', async ({ page }) => {
    await mockApis(page);
    await page.route('https://api.github.com/repos/Karelisio/Prisme/releases/latest', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RELEASE) }),
    );
    await page.goto('/');
    await switchToEnglish(page);

    // La vérification au démarrage repart quand l'interface est redessinée : le message est en anglais.
    const snackbar = page.locator('.snackbar').filter({ hasText: 'Prisme 0.2.0 is available' });
    await snackbar.getByRole('button', { name: 'View' }).click({ timeout: 15_000 });

    const sheet = page.getByRole('dialog', { name: 'Update available' });
    await expect(sheet.getByText('Prisme 0.2.0 · 3.7 MB')).toBeVisible();
    await page.evaluate(() => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.canInstall = false;
    });
    await sheet.getByRole('button', { name: 'Install' }).click();
    await expect(sheet.getByText(/Android needs you to allow Prisme to install apps/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Open setting' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Later' }).click();
    await expect(sheet).toBeHidden();
    const settings = settingsTab(page);
    const row = settings.getByRole('button', { name: /Update 0\.2\.0 available/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('tap to install');
  });
});

test.describe('téléphone en anglais', () => {
  test.use({ locale: 'en-US' });

  test('l’introduction s’affiche en anglais sans aucun réglage', async ({ page }) => {
    await mockApis(page, { intro: true });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const dialog = page.getByRole('dialog', { name: 'Introduction' });

    await expect(dialog.getByRole('heading', { name: 'Welcome to Prisme' })).toBeVisible();
    await expect(dialog.getByText('Beautiful wallpapers, applied in one tap.')).toBeVisible();
    await expect(dialog.getByText('High-resolution wallpapers')).toBeVisible();
    await expect(dialog.getByText('Choose your look')).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Light' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(dialog.getByText('Step 1 of 3')).toBeAttached();
    await dialog.getByRole('button', { name: 'Next' }).click();

    await expect(dialog.getByRole('heading', { name: 'Your sources' })).toBeVisible();
    await expect(dialog.getByRole('switch', { name: 'Unsplash' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText('Photos, Wallpapers topic first')).toBeVisible();
    await dialog.getByRole('button', { name: 'Next' }).click();

    await expect(dialog.getByRole('heading', { name: 'What do you like?' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Abstract' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Abstract' }).click();
    await dialog.getByRole('button', { name: 'Blue' }).click();
    await dialog.getByRole('button', { name: 'Get started' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(cells(page).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Your tastes now shape “For you”' })).toBeVisible();
    await page.getByRole('button', { name: 'For you' }).click();
    await expect(page.getByText('Based on your tastes: Abstract, Blue')).toBeVisible();

    // « Langue du téléphone » est le réglage par défaut.
    await nav(page).getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Phone language' })).toHaveAttribute('aria-pressed', 'true');
  });
});
