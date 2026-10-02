import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });
const widgetRequests = (page: Page) => page.evaluate(() => window.__prismeSystemWeb?.widgetRequests);
const tileRequests = (page: Page) => page.evaluate(() => window.__prismeSystemWeb?.tileRequests);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return page.locator('.tab[data-active="true"]');
}

test.describe('widget d’accueil', () => {
  test('le bouton des réglages demande au lanceur de poser le widget', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);

    // Près de la tuile « Fond suivant », avec un sous-titre qui explique ce que fait le widget.
    const entry = settings.getByRole('button', { name: /Widget d'accueil/ });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText('Aperçu du fond actuel et bouton « Fond suivant »');
    await expect(settings.getByRole('button', { name: /Tuile « Fond suivant »/ })).toBeVisible();
    expect(await widgetRequests(page)).toBe(0);

    await entry.click();
    await expect.poll(() => widgetRequests(page)).toBe(1);
    // Le lanceur affiche lui-même sa confirmation : l'app n'ajoute aucun message, et ne touche pas à la tuile.
    await expect(page.locator('.snackbar')).toHaveCount(0);
    expect(await tileRequests(page)).toBe(0);

    // Une nouvelle demande repart (le lanceur gère les doublons).
    await entry.click();
    await expect.poll(() => widgetRequests(page)).toBe(2);
  });

  test('lanceur sans épinglage : le message indique où trouver le widget', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await page.evaluate(() => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.widgetResult = 'unsupported';
    });
    const settings = await openSettings(page);

    await settings.getByRole('button', { name: /Widget d'accueil/ }).click();
    await expect(snackbar(page, "Appui long sur l'écran d'accueil › Widgets › Prisme")).toBeVisible();
    expect(await widgetRequests(page)).toBe(1);
  });
});
