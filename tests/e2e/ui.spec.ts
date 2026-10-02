import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

declare global {
  interface Window {
    /** Suivi des View Transitions (voir trackTransitions). */
    __vt?: { started: number; finished: number; hero: number; kinds: string[] };
    /** Nombre d'animations lancées sur la scène de l'aperçu (animation FLIP). */
    __flip?: number;
  }
}

/** PNG de 1 × 1 pixel : une image « du téléphone » pour l'import. */
const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const activeTab = (page: Page) => page.locator('.tab[data-active="true"]');
const html = (page: Page) => page.locator('html');
const intro = (page: Page) => page.getByRole('dialog', { name: 'Introduction' });

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return activeTab(page);
}

const cssVariable = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** Erreurs de la page : exceptions et messages d'erreur de la console (hors échecs de chargement simulés par les mocks). */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror : ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`console : ${message.text()}`);
  });
  return errors;
}

/**
 * Journal des transitions : appels à startViewTransition (et type de transition au moment de l'appel),
 * transitions terminées, images où le groupe « hero » (la miniature qui grandit) est animé, et
 * animations de la scène de l'aperçu (FLIP). `withoutViewTransitions` retire l'API pour tester le repli.
 */
async function trackTransitions(page: Page, { withoutViewTransitions = false } = {}) {
  await page.addInitScript((without) => {
    const log = { started: 0, finished: 0, hero: 0, kinds: [] as string[] };
    window.__vt = log;
    window.__flip = 0;
    if (without) delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition;
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((callback?: ViewTransitionUpdateCallback) => {
        log.started++;
        log.kinds.push(document.documentElement.dataset.vt ?? '');
        const transition = start(callback);
        transition.finished.then(
          () => log.finished++,
          () => undefined,
        );
        return transition;
      }) as typeof document.startViewTransition;
      setInterval(() => {
        const animated = document.getAnimations().some((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === '::view-transition-group(hero)');
        if (animated) log.hero++;
      }, 16);
    }
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.classList.contains('preview__stage')) window.__flip = (window.__flip ?? 0) + 1;
      return animate.apply(this, args);
    };
  }, withoutViewTransitions);
}

const transitions = (page: Page) => page.evaluate(() => ({ ...window.__vt, flip: window.__flip }));

test.describe('grille réglable', () => {
  test('4 colonnes : quatre cellules par rangée, miniatures plus légères', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const widthParam = async () => Number(new URL((await cells(page).first().locator('img').getAttribute('src')) ?? '').searchParams.get('w'));
    await expect(cells(page).first()).toBeVisible();
    const twoColumns = await widthParam();

    const settings = await openSettings(page);
    await expect(settings.getByRole('radiogroup', { name: 'Disposition de la grille' })).toBeVisible();
    await expect(settings.getByRole('radio', { name: '2 colonnes' })).toHaveAttribute('aria-checked', 'true');
    await settings.getByRole('radio', { name: '4 colonnes' }).click();
    await expect(settings.getByRole('radio', { name: '4 colonnes' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Explorer' }).click();

    const row = page.locator('.tab[data-active="true"] .wp-grid__row').first();
    await expect(row).toHaveCSS('grid-template-columns', /^\S+ \S+ \S+ \S+$/);
    await expect(row.locator('.wp-cell')).toHaveCount(4);
    const boxes = await row.locator('.wp-cell').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
    expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    // Cellules plus étroites : des miniatures plus petites suffisent.
    await expect.poll(widthParam).toBeLessThan(twoColumns);
  });

  test('mosaïque : hauteurs variées, colonnes équilibrées, défilement infini', async ({ page }) => {
    const sizes: [number, number][] = [
      [3000, 6000],
      [3000, 4200],
      [3000, 5400],
      [2400, 3200],
      [3000, 6600],
      [3000, 3900],
    ];
    const log = await mockApis(page, { sizes });
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('radio', { name: 'Mosaïque' }).click();
    await expect(settings.getByRole('radio', { name: 'Mosaïque' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Explorer' }).click();

    const grid = page.locator('.tab[data-active="true"] .wp-grid--mosaic');
    await expect(grid.locator('.wp-cell').first()).toBeVisible();
    await expect(page.locator('.tab[data-active="true"] .wp-grid__row')).toHaveCount(0);
    const gridTop = (await grid.boundingBox())?.y ?? 0;
    const tiles = await grid
      .locator('.wp-cell')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: Math.round(r.left), top: r.top, height: Math.round(r.height), width: Math.round(r.width) })));
    expect(tiles.length).toBeGreaterThan(6);

    // Hauteurs variées (chaque vignette suit le format de son image), sur deux colonnes de même largeur.
    expect(new Set(tiles.map((t) => t.height)).size).toBeGreaterThanOrEqual(3);
    const columns = [...new Set(tiles.map((t) => t.x))].sort((a, b) => a - b);
    expect(columns).toHaveLength(2);
    expect(new Set(tiles.map((t) => t.width)).size).toBe(1);

    // Répartition : chaque vignette est dans la colonne la moins haute à son tour (la plus à gauche à égalité).
    const bottoms = columns.map(() => 0);
    tiles.forEach((tile, i) => {
      const shortest = bottoms.findIndex((b) => b === Math.min(...bottoms));
      expect(tile.x, `vignette ${i}`).toBe(columns[shortest]);
      expect(Math.abs(tile.top - gridTop - (bottoms[shortest] ?? 0)), `haut de la vignette ${i}`).toBeLessThan(1.5);
      bottoms[shortest] = tile.top - gridTop + tile.height + 8;
    });

    // Le défilement infini continue de charger les pages suivantes.
    const scroller = page.locator('.tab[data-active="true"] .screen');
    const secondPage = () => log.unsplash.some((u) => u.searchParams.get('page') === '2');
    for (let i = 0; i < 14 && !secondPage(); i++) {
      await scroller.evaluate((el) => el.scrollBy(0, 4000));
      await page.waitForTimeout(150);
    }
    expect(secondPage()).toBe(true);

    // Une vignette de la mosaïque ouvre l'aperçu, qui se ferme sur la même mosaïque.
    await scroller.evaluate((el) => el.scrollTo(0, 0));
    await grid.locator('.wp-cell').nth(2).click();
    await expect(page.getByTestId('preview-stage')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(grid.locator('.wp-cell').first()).toBeVisible();
  });

  test('la mosaïque s’applique aussi à la recherche et à la bibliothèque', async ({ page }) => {
    await mockApis(page, { sizes: [[3000, 6000], [3000, 4200], [3000, 5400]] });
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('radio', { name: 'Mosaïque' }).click();
    await page.getByRole('button', { name: 'Explorer' }).click();
    await cells(page).first().click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    await expect(page.locator('.tab[data-active="true"] .wp-grid--mosaic .wp-cell')).toHaveCount(1);

    await page.getByRole('button', { name: 'Explorer' }).click();
    await page.getByRole('button', { name: 'Rechercher des fonds' }).click();
    const input = page.getByRole('searchbox', { name: 'Rechercher' });
    await input.fill('montagne');
    await input.press('Enter');
    await expect(page.locator('.overlay-screen .wp-grid--mosaic .wp-cell').first()).toBeVisible();
  });

  test('un ancien réglage à 3 colonnes est repris tel quel', async ({ page }) => {
    await mockApis(page);
    // Réglages enregistrés par la version précédente (format 1) : `gridColumns` et le thème sombre.
    await page.addInitScript(() => {
      if (localStorage.getItem('prisme-settings') === null) {
        localStorage.setItem('prisme-settings', JSON.stringify({ state: { gridColumns: 3, themeMode: 'dark' }, version: 1 }));
      }
    });
    await page.goto('/');
    await expect(page.locator('.tab[data-active="true"] .wp-grid__row').first()).toHaveCSS('grid-template-columns', /^\S+ \S+ \S+$/);
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    const settings = await openSettings(page);
    await expect(settings.getByRole('radio', { name: '3 colonnes' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('radio', { name: 'Sombre', exact: true })).toHaveAttribute('aria-checked', 'true');

    // Réenregistrés dans le nouveau format.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('prisme-settings') ?? '{}'));
    expect(stored.version).toBe(2);
    expect(stored.state.gridLayout).toBe('3');
    expect(stored.state.gridColumns).toBeUndefined();
  });
});

test.describe('thème noir', () => {
  test('fonds noirs purs, barre de navigation noire, accent au choix, mémorisé', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await expect(settings.getByRole('radiogroup', { name: 'Thème' }).getByRole('radio')).toHaveCount(4);
    await settings.getByRole('radio', { name: 'Noir', exact: true }).click();

    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(html(page)).toHaveAttribute('data-amoled', 'true');
    await expect(html(page)).toHaveCSS('color-scheme', 'dark');
    for (const role of ['surface', 'background', 'surface-dim', 'surface-container-lowest']) {
      expect(await cssVariable(page, `--md-sys-color-${role}`), role).toBe('#000000');
    }
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('.nav-bar')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#000000');
    // Les conteneurs restent distincts du fond.
    expect(await cssVariable(page, '--md-sys-color-surface-container-high')).not.toBe('#000000');

    // L'accent choisi s'applique, les fonds restent noirs.
    const before = await cssVariable(page, '--md-sys-color-primary');
    await settings.getByRole('radio', { name: /Vert/ }).click();
    await expect.poll(() => cssVariable(page, '--md-sys-color-primary')).not.toBe(before);
    expect(await cssVariable(page, '--md-sys-color-surface')).toBe('#000000');

    // Mémorisé.
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-amoled', 'true');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    // Le thème sombre habituel garde ses surfaces teintées.
    await page.getByRole('button', { name: 'Réglages' }).click();
    await activeTab(page).getByRole('radio', { name: 'Sombre', exact: true }).click();
    await expect(html(page)).not.toHaveAttribute('data-amoled', 'true');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await cssVariable(page, '--md-sys-color-surface')).not.toBe('#000000');
  });

  test('le fond du thème choisi est là dès le chargement, avant le premier rendu de l’app', async ({ page }) => {
    await mockApis(page);
    await page.addInitScript(() => {
      if (localStorage.getItem('prisme-settings') === null) {
        localStorage.setItem('prisme-settings', JSON.stringify({ state: { themeMode: 'black' }, version: 2 }));
      }
    });
    // Le code de l'app n'arrive jamais : seuls le HTML, son script de démarrage et sa feuille de style comptent.
    await page.route(/\/assets\/.*\.js$/, () => undefined);
    await page.goto('/', { waitUntil: 'commit' });
    await expect(html(page)).toHaveAttribute('data-boot', 'black');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(page.locator('.wp-cell')).toHaveCount(0);

    // Sombre : le fond sombre habituel, même quand le système est en mode clair.
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => localStorage.setItem('prisme-settings', JSON.stringify({ state: { themeMode: 'dark' }, version: 2 })));
    await page.reload({ waitUntil: 'commit' });
    await expect(html(page)).toHaveAttribute('data-boot', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 18, 24)');
  });

  test('« Auto » suit le système mais ne devient jamais noir', async ({ page }) => {
    await mockApis(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(html(page)).not.toHaveAttribute('data-amoled', 'true');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
  });

  test('le thème noir couvre aussi l’aperçu, les feuilles et les écrans superposés', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('radio', { name: 'Noir', exact: true }).click();
    // Écran superposé : fond noir.
    await settings.getByRole('button', { name: /Diagnostic/ }).click();
    await expect(page.locator('.overlay-screen')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await page.keyboard.press('Escape');
    // Feuille : plus claire que le fond, donc lisible.
    await page.getByRole('button', { name: 'Explorer' }).click();
    await page.getByRole('button', { name: 'Filtres' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filtres' });
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(0, 0, 0)');
  });
});

test.describe('introduction au premier lancement', () => {
  test('trois écrans : bienvenue, sources, goûts qui orientent « Pour toi » ; elle ne revient plus', async ({ page }) => {
    const log = await mockApis(page, { intro: true });
    await page.goto('/');
    const dialog = intro(page);

    // 1. Bienvenue : l'app n'est pas encore lancée (aucun chargement) ; le thème se choisit dès ici.
    await expect(dialog.getByRole('heading', { name: 'Bienvenue dans Prisme' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Passer' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retour' })).toHaveCount(0);
    await expect(page.locator('.wp-cell')).toHaveCount(0);
    expect(log.unsplash).toHaveLength(0);
    await dialog.getByRole('radio', { name: 'Noir', exact: true }).click();
    await expect(html(page)).toHaveAttribute('data-amoled', 'true');
    await dialog.getByRole('button', { name: 'Suivant' }).click();

    // 2. Sources : les mêmes interrupteurs que Réglages › Sources.
    await expect(dialog.getByRole('heading', { name: 'Tes sources' })).toBeVisible();
    await expect(dialog.getByRole('switch', { name: 'Unsplash' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByRole('switch', { name: 'Pixabay' })).toHaveAttribute('aria-checked', 'false');
    await dialog.getByRole('switch', { name: 'Pexels' }).click();
    await expect(dialog.getByRole('switch', { name: 'Pexels' })).toHaveAttribute('aria-checked', 'false');
    await dialog.getByRole('button', { name: 'Retour' }).click();
    await expect(dialog.getByRole('heading', { name: 'Bienvenue dans Prisme' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await dialog.getByRole('button', { name: 'Suivant' }).click();

    // 3. Goûts : thèmes et couleurs.
    await expect(dialog.getByRole('heading', { name: 'Qu’est-ce qui te plaît ?' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Commencer' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Nature' }).click();
    await dialog.getByRole('button', { name: 'Bleu' }).click();
    await expect(dialog.getByRole('button', { name: 'Nature' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Commencer' }).click();

    // L'app démarre avec les sources choisies, les goûts alimentent « Pour toi » (sans Pexels, désactivé).
    await expect(dialog).toHaveCount(0);
    await expect(cells(page).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible();
    await expect(page.getByText('Tes goûts orientent désormais « Pour toi »')).toBeVisible();
    await page.getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText('D’après tes goûts : Nature, Bleu')).toBeVisible();
    await expect.poll(() => log.unsplash.some((u) => u.pathname === '/topics/nature/photos')).toBe(true);
    await expect.poll(() => log.unsplash.some((u) => u.pathname === '/search/photos' && u.searchParams.get('color') === 'blue')).toBe(true);
    await expect(cells(page).first()).toBeVisible();
    expect(log.pexels).toHaveLength(0);

    const stored = await page.evaluate(() => ({
      onboarding: JSON.parse(localStorage.getItem('prisme-onboarding') ?? '{}'),
      settings: JSON.parse(localStorage.getItem('prisme-settings') ?? '{}'),
    }));
    expect(stored.onboarding.state).toEqual({ seen: true, tastes: { categories: ['nature'], colors: ['blue'] } });
    expect(stored.settings.state.sources.pexels).toBe(false);
    expect(stored.settings.state.themeMode).toBe('black');

    // Jamais plus : ni au rechargement, ni aux lancements suivants.
    await page.reload();
    await expect(cells(page).first()).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(html(page)).toHaveAttribute('data-amoled', 'true');
    await page.getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText('D’après tes goûts : Nature, Bleu')).toBeVisible();
  });

  test('« Passer » est possible à tout moment, et l’introduction ne revient pas', async ({ page }) => {
    const log = await mockApis(page, { intro: true });
    await page.goto('/');
    const dialog = intro(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await expect(dialog.getByRole('heading', { name: 'Tes sources' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Passer' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(cells(page).first()).toBeVisible();
    expect(log.unsplash.length).toBeGreaterThan(0);

    // Sans goût choisi, « Pour toi » garde son invitation à ajouter des favoris.
    await page.getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText(/Ajoute au moins 3 favoris/)).toBeVisible();

    await page.reload();
    await expect(cells(page).first()).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('le bouton retour recule d’une étape, puis ferme l’introduction', async ({ page }) => {
    await mockApis(page, { intro: true });
    await page.goto('/');
    const dialog = intro(page);
    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await expect(dialog.getByRole('heading', { name: 'Qu’est-ce qui te plaît ?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('heading', { name: 'Tes sources' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('heading', { name: 'Bienvenue dans Prisme' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cells(page).first()).toBeVisible();
  });

  test('« Revoir l’introduction » la rouvre sans quitter l’écran ni perdre les goûts', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);

    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Revoir l’introduction/ }).click();
    const dialog = intro(page);
    await expect(dialog.getByRole('heading', { name: 'Bienvenue dans Prisme' })).toBeVisible();
    // L'app reste en place dessous, hors d'atteinte.
    await expect(activeTab(page)).toHaveAttribute('inert', '');

    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await dialog.getByRole('button', { name: 'Suivant' }).click();
    await dialog.getByRole('button', { name: 'Espace' }).click();
    await dialog.getByRole('button', { name: 'Commencer' }).click();
    await expect(dialog).toHaveCount(0);
    // Toujours dans les Réglages, utilisables.
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
    await expect(activeTab(page)).not.toHaveAttribute('inert', '');

    await page.getByRole('button', { name: 'Explorer' }).click();
    await page.getByRole('button', { name: 'Pour toi' }).click();
    await expect(page.getByText('D’après tes goûts : Espace')).toBeVisible();
    await expect.poll(() => log.nasa.length).toBeGreaterThan(0);

    // Passer ne touche pas aux goûts enregistrés.
    await page.getByRole('button', { name: 'Réglages' }).click();
    await activeTab(page).getByRole('button', { name: /Revoir l’introduction/ }).click();
    await intro(page).getByRole('button', { name: 'Passer' }).click();
    await expect(intro(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Explorer' }).click();
    await expect(page.getByText('D’après tes goûts : Espace')).toBeVisible();
  });

  test('une installation qui existait déjà ne voit pas l’introduction', async ({ page }) => {
    await mockApis(page, { intro: true });
    // Réglages d'une version d'avant l'introduction : l'app a déjà servi.
    await page.addInitScript(() => {
      if (localStorage.getItem('prisme-settings') === null) {
        localStorage.setItem('prisme-settings', JSON.stringify({ state: { haptics: false }, version: 1 }));
      }
    });
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await expect(intro(page)).toHaveCount(0);
  });
});

test.describe('transitions animées', () => {
  test('View Transitions : la miniature s’agrandit en aperçu, puis revient à sa place', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true });
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    test.skip(!(await page.evaluate(() => typeof document.startViewTransition === 'function')), 'View Transitions indisponible dans ce navigateur');

    const thumbnail = cells(page).first();
    await thumbnail.click();
    const stage = page.getByTestId('preview-stage');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await transitions(page)).finished).toBe(1);
    const opened = await transitions(page);
    expect(opened.kinds).toEqual(['hero-open']);
    // L'élément partagé a bien été animé (groupe « hero »), puis les noms de transition ont été retirés.
    expect(opened.hero).toBeGreaterThan(0);
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    await expect(thumbnail).toHaveCSS('view-transition-name', 'none');
    await expect(stage).toHaveCSS('view-transition-name', 'none');

    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect.poll(async () => (await transitions(page)).finished).toBe(2);
    const closed = await transitions(page);
    expect(closed.kinds).toEqual(['hero-open', 'hero-close']);
    expect(closed.hero).toBeGreaterThan(opened.hero ?? 0);
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    await expect(thumbnail).toBeVisible();
    await expect(thumbnail).toHaveCSS('view-transition-name', 'none');
    // Le bouton retour de l'aperçu fait de même, et la grille reste utilisable.
    await thumbnail.click();
    await expect(stage).toBeVisible();
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(thumbnail).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('la transition vers l’aperçu fonctionne aussi depuis une vignette de la mosaïque', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true, sizes: [[3000, 6000], [3000, 4200], [3000, 5400]] });
    await page.addInitScript(() => {
      if (localStorage.getItem('prisme-settings') === null) {
        localStorage.setItem('prisme-settings', JSON.stringify({ state: { gridLayout: 'mosaic' }, version: 2 }));
      }
    });
    await trackTransitions(page);
    await page.goto('/');
    const tile = page.locator('.tab[data-active="true"] .wp-grid--mosaic .wp-cell').nth(1);
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.getByTestId('preview-stage')).toBeVisible();
    await expect.poll(async () => (await transitions(page)).finished).toBe(1);
    expect((await transitions(page)).hero).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect.poll(async () => (await transitions(page)).finished).toBe(2);
    expect((await transitions(page)).kinds).toEqual(['hero-open', 'hero-close']);
    await expect(tile).toBeVisible();
    await expect(tile).toHaveCSS('view-transition-name', 'none');
    expect(errors).toEqual([]);
  });

  test('sans View Transitions : animation FLIP de la scène, vers la miniature et en retour', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true });
    await trackTransitions(page, { withoutViewTransitions: true });
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined');

    await cells(page).first().click();
    const stage = page.getByTestId('preview-stage');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await transitions(page)).flip).toBeGreaterThanOrEqual(1);
    // L'animation se termine : la scène retrouve sa taille et sa place, sans transformation résiduelle.
    await expect.poll(() => stage.evaluate((el) => el.getAnimations().length)).toBe(0);
    await expect(stage).toHaveCSS('transform', 'none');
    await expect(stage).toHaveCSS('clip-path', 'none');
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    expect((await transitions(page)).started).toBe(0);

    // Fermeture : la scène rétrécit vers la miniature avant d'être retirée.
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await transitions(page)).flip).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    await expect(cells(page).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('mouvement réduit : aucune transition, l’aperçu s’ouvre et se ferme aussitôt', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page); // mouvement réduit par défaut
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await cells(page).first().click();
    await expect(page.getByTestId('preview-stage')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('button', { name: /Diagnostic/ }).click();
    await expect(page.locator('.overlay-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await transitions(page)).toMatchObject({ started: 0, flip: 0, hero: 0 });
    expect(errors).toEqual([]);

    // Le réglage du système est suivi à chaud : sans mouvement réduit, la transition reprend.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Explorer' }).click();
    await expect.poll(async () => (await transitions(page)).started).toBeGreaterThan(0);
  });

  test('entre écrans : onglets en fondu, écrans qui s’ouvrent et se ferment', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true });
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();

    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
    await page.getByRole('button', { name: /Diagnostic/ }).click();
    await expect(page.locator('.overlay-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.overlay-screen')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    await expect(page.getByRole('heading', { name: 'Bibliothèque' })).toBeVisible();

    await expect.poll(async () => (await transitions(page)).finished).toBe(4);
    expect((await transitions(page)).kinds).toEqual(['fade', 'forward', 'back', 'fade']);
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    // Toucher l'onglet déjà actif ne lance aucune transition.
    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    await page.waitForTimeout(200);
    expect((await transitions(page)).started).toBe(4);
    expect(errors).toEqual([]);
  });

  test('deux retours enchaînés dans la même image : le second voit l’effet du premier', async ({ page }) => {
    await mockApis(page, { motion: true });
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.getByRole('button', { name: /Diagnostic/ }).click();
    await expect(page.locator('.overlay-screen')).toBeVisible();
    await expect.poll(async () => (await transitions(page)).finished).toBe(2);

    // Deux appuis sur « retour » dans la même tâche : le premier ferme l'écran, le second revient à Explorer.
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await expect(page.locator('.overlay-screen')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page');
    await expect(cells(page).first()).toBeVisible();
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
  });

  test('un fond feuilleté dans l’aperçu : la fermeture rejoint la miniature du fond affiché', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true });
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await cells(page).first().click();
    const stage = page.getByTestId('preview-stage');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await transitions(page)).finished).toBe(1);

    // Glissé au-delà du bord : le fond voisin remplace l'aperçu (sans transition, pour enchaîner les balayages).
    const first = await page.getByRole('dialog', { name: 'Aperçu du fond d’écran' }).locator('.preview__image').getAttribute('src');
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Aperçu du fond d’écran' }).locator('.preview__image')).not.toHaveAttribute('src', first ?? '');
    expect((await transitions(page)).started).toBe(1);

    // La fermeture rétrécit vers la miniature du fond désormais affiché.
    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect.poll(async () => (await transitions(page)).finished).toBe(2);
    expect((await transitions(page)).kinds).toEqual(['hero-open', 'hero-close']);
    await expect(cells(page).nth(1)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('aperçu ouvert sans miniature (photo importée) : fondu à l’aller comme au retour', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page, { motion: true });
    await trackTransitions(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();

    // Image du téléphone : l'aperçu s'ouvre sans passer par une miniature de la grille.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Importer depuis la galerie' }).click();
    await (await chooser).setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
    const stage = page.getByTestId('preview-stage');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await transitions(page)).finished).toBe(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('.preview')).toHaveCount(0);
    await expect.poll(async () => (await transitions(page)).finished).toBe(2);
    // Pas d'élément partagé à rejoindre dans la grille : un simple fondu.
    expect((await transitions(page)).kinds).toEqual(['fade', 'fade']);
    await expect(html(page)).not.toHaveAttribute('data-vt', /.*/);
    expect(errors).toEqual([]);
  });
});
