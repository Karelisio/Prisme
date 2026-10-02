import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const preview = (page: Page) => page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });
const web = <T,>(page: Page, read: () => T) => page.evaluate(read);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return page.locator('.tab[data-active="true"]');
}

async function applyTo(page: Page, screen: string) {
  await preview(page).getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: screen }).click();
  await expect(snackbar(page, 'Fond appliqué')).toBeVisible();
}

/** Glisse l'image vers la gauche (fond suivant) ou la droite (précédent), bien au-delà du bord. */
async function swipe(page: Page, direction: 'left' | 'right') {
  const box = (await page.getByTestId('preview-stage').boundingBox())!;
  const y = box.y + box.height * 0.5;
  const [from, to] = direction === 'left' ? [0.85, 0.05] : [0.15, 0.95];
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (from + ((to - from) * i) / 8), y);
  await page.mouse.up();
}

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

async function mockRelease(page: Page) {
  await page.route('https://api.github.com/repos/Karelisio/Prisme/releases/latest', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RELEASE) }),
  );
}

test.describe('aperçu', () => {
  test('partage avec crédit et enregistrement dans la galerie', async ({ page }) => {
    const log = await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();

    await preview(page).getByRole('button', { name: 'Partager' }).click();
    await expect.poll(() => web(page, () => window.__prismeWeb?.shared.length)).toBe(1);
    const shared = await web(page, () => window.__prismeWeb?.shared[0]);
    expect(shared?.text).toMatch(/^Photo de Ada Lovelace sur Unsplash : https:\/\//);
    expect(shared?.uri).toMatch(/^https:\/\/images\.unsplash\.com\//);

    await preview(page).getByRole('button', { name: 'Plus d’actions' }).click();
    await page.getByRole('button', { name: 'Enregistrer dans la galerie' }).click();
    await expect(snackbar(page, 'Enregistré dans la galerie')).toBeVisible();
    const saved = await web(page, () => window.__prismeWeb?.saved[0]);
    expect(saved?.name).toMatch(/^Prisme_unsplash:/);
    // Unsplash : un téléchargement compté par sortie de la photo (partage puis galerie).
    await expect.poll(() => log.downloads.length).toBe(2);
  });

  test('balayer passe aux fonds voisins de la grille', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await expect(preview(page).getByText(/Ada Lovelace/)).toBeVisible();

    await swipe(page, 'left');
    await expect(preview(page).getByText(/Grace Hopper/)).toBeVisible();
    await swipe(page, 'right');
    await expect(preview(page).getByText(/Ada Lovelace/)).toBeVisible();
    // Premier fond : rien avant, l'aperçu reste en place.
    await swipe(page, 'right');
    await expect(preview(page).getByText(/Ada Lovelace/)).toBeVisible();
    // Un seul aperçu dans la pile : retour = galerie.
    await page.keyboard.press('Escape');
    await expect(preview(page)).toBeHidden();
  });

  test('annuler remet le fond précédent, depuis l’aperçu et l’historique', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await applyTo(page, "Écran d'accueil");
    await page.keyboard.press('Escape');
    await cells(page).nth(1).click();
    await applyTo(page, "Écran d'accueil");
    await snackbar(page, 'Fond appliqué').getByRole('button', { name: 'Annuler' }).click();
    await expect(snackbar(page, 'Fond précédent restauré')).toBeVisible();

    const applied = await web(page, () => window.__prismeWeb?.applied ?? []);
    expect(applied).toHaveLength(3);
    expect(applied[2]).toMatchObject({ target: 'home', id: applied[0]?.id, uri: applied[0]?.uri });

    // Bibliothèque › Historique : il ne reste que le premier fond.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    await page.getByRole('radio', { name: 'Historique' }).click();
    const library = page.locator('.tab[data-active="true"]');
    await expect(library.locator('.history__thumb')).toHaveCount(1);
    await expect(library.getByRole('button', { name: 'Revenir au fond précédent' })).toHaveCount(0);
  });

  test('vibrations sur les actions importantes, désactivables', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await preview(page).getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await applyTo(page, "Écran d'accueil");
    await expect.poll(() => web(page, () => window.__prismeSystemWeb?.haptics)).toEqual(['tick', 'confirm']);

    await page.keyboard.press('Escape');
    const settings = await openSettings(page);
    await settings.getByRole('switch', { name: 'Retours haptiques' }).click();
    await page.getByRole('button', { name: 'Explorer' }).click();
    await cells(page).first().click();
    await preview(page).getByRole('button', { name: 'Retirer des favoris' }).click();
    await expect(snackbar(page, 'Retiré des favoris')).toBeVisible();
    expect(await web(page, () => window.__prismeSystemWeb?.haptics.length)).toBe(2);
  });
});

test.describe('raccourcis', () => {
  test('les favoris alimentent la tuile « Fond suivant », proposée depuis les réglages', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await preview(page).getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await expect
      .poll(() => web(page, () => window.__prismeAutomationWeb?.quickPool))
      .toMatchObject({ target: 'both', items: [{ id: expect.stringMatching(/^unsplash:/), uri: expect.stringMatching(/^https:/) }] });

    await page.keyboard.press('Escape');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Tuile « Fond suivant »/ }).click();
    await expect(snackbar(page, 'Tuile ajoutée aux Réglages rapides')).toBeVisible();
    expect(await web(page, () => window.__prismeSystemWeb?.tileRequests)).toBe(1);
  });

  test('le raccourci « Rechercher » ouvre la recherche', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(cells(page).first()).toBeVisible();
    await page.evaluate(() => window.__prismeSystemWeb?.triggerAction('SEARCH'));
    await expect(page.getByRole('searchbox', { name: 'Rechercher' })).toBeVisible();
  });
});

test.describe('réglages', () => {
  test('sauvegarde puis restauration fusionnée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await cells(page).first().click();
    await preview(page).getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');

    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Exporter une sauvegarde/ }).click();
    await expect(snackbar(page, 'Sauvegarde enregistrée : 1 favori, 0 collection')).toBeVisible();
    const exported = await web(page, () => window.__prismeSystemWeb?.exports[0]);
    expect(exported?.fileName).toMatch(/^prisme-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = JSON.parse(exported?.data ?? '{}');
    expect(backup.format).toBe('prisme-backup');

    // Restauration d'une autre sauvegarde : un favori et une collection en plus.
    const extra = {
      ...backup,
      library: {
        ...backup.library,
        items: {
          ...backup.library.items,
          'pexels:42': { ...Object.values<Record<string, unknown>>(backup.library.items)[0], id: 'pexels:42', source: 'pexels', alt: 'Lac' },
        },
        favorites: { 'pexels:42': 1 },
        collections: [{ id: 'c-mer', name: 'Mer', createdAt: 1, itemIds: ['pexels:42'] }],
        history: [],
      },
      settings: { ...backup.settings, gridColumns: 3 },
    };
    await page.evaluate((data) => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.nextImport = data;
    }, JSON.stringify(extra));
    await settings.getByRole('button', { name: /Restaurer une sauvegarde/ }).click();
    await expect(snackbar(page, 'Sauvegarde restaurée : 1 favori, 1 collection')).toBeVisible();
    await expect(settings.getByRole('radio', { name: '3 colonnes' })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Bibliothèque' }).click();
    const library = page.locator('.tab[data-active="true"]');
    await expect(library.locator('.wp-cell')).toHaveCount(2);
    await library.getByRole('radio', { name: 'Collections' }).click();
    await expect(library.getByRole('button', { name: /Mer/ })).toBeVisible();
  });

  test('HD seulement en Wi-Fi : image à la taille de l’écran sur données mobiles', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('switch', { name: 'HD seulement en Wi-Fi' }).click();
    await page.evaluate(() => window.__prismeSystemWeb?.setMetered(true));
    await page.getByRole('button', { name: 'Explorer' }).click();
    await cells(page).first().click();
    await applyTo(page, "Écran d'accueil");
    await page.evaluate(() => window.__prismeSystemWeb?.setMetered(false));
    await applyTo(page, "Écran d'accueil");

    const widths = await web(page, () => (window.__prismeWeb?.applied ?? []).map((a) => Number(new URL(a.uri).searchParams.get('w'))));
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths[0]).toBeLessThan(widths[1] ?? 0);
    expect(widths[1]).toBe(3000);
  });

  test('journal d’erreurs : erreurs de l’interface, partage et effacement', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('boum de test');
      });
    });
    await page.waitForTimeout(100);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Diagnostic/ }).click();
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Journal d’erreurs' }) });
    await expect(section.getByText('Error: boum de test', { exact: true })).toBeVisible();
    await section.getByRole('button', { name: 'Partager' }).click();
    await expect.poll(() => web(page, () => window.__prismeSystemWeb?.sharedTexts[0]?.text ?? '')).toContain('boum de test');
    await section.getByRole('button', { name: 'Effacer' }).click();
    await expect(section.getByText('Aucune erreur enregistrée.')).toBeVisible();
  });
});

test.describe('mises à jour', () => {
  test('proposée au démarrage, installée après autorisation', async ({ page }) => {
    await mockApis(page);
    await mockRelease(page);
    await page.goto('/');
    await snackbar(page, 'Prisme 0.2.0 est disponible').getByRole('button', { name: 'Voir' }).click({ timeout: 10_000 });

    const sheet = page.getByRole('dialog', { name: 'Mise à jour disponible' });
    await expect(sheet.getByText('Tuile « Fond suivant »')).toBeVisible();
    await page.evaluate(() => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.canInstall = false;
    });
    await sheet.getByRole('button', { name: 'Installer' }).click();
    await expect(sheet.getByText(/autoriser Prisme à installer/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Ouvrir le réglage' }).click();
    expect(await web(page, () => window.__prismeSystemWeb?.settingsOpened)).toBe(1);

    await page.evaluate(() => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.canInstall = true;
    });
    await sheet.getByRole('button', { name: 'Installer' }).click();
    await expect.poll(() => web(page, () => window.__prismeSystemWeb?.installs)).toBe(1);
    expect(await web(page, () => window.__prismeSystemWeb?.downloads)).toEqual([RELEASE.assets[0]?.browser_download_url]);
  });

  test('« Plus tard » : plus de rappel, la release reste dans les réglages', async ({ page }) => {
    await mockApis(page);
    await mockRelease(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Rechercher une mise à jour/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Mise à jour disponible' });
    await sheet.getByRole('button', { name: 'Plus tard' }).click();
    await expect(sheet).toBeHidden();
    await expect(settings.getByRole('button', { name: /Mise à jour 0\.2\.0 disponible/ })).toBeVisible();

    await page.reload();
    await page.waitForTimeout(5000);
    await expect(snackbar(page, 'est disponible')).toHaveCount(0);
  });

  test('aucune release plus récente : « Prisme est à jour »', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Rechercher une mise à jour/ }).click();
    await expect(snackbar(page, 'Prisme est à jour')).toBeVisible();
  });
});
