import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const lastConfigure = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.configureCalls.at(-1) ?? null);
const lastPlaylist = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.playlistCalls.at(-1) ?? null);

async function addFavorites(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await cells(page).nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

async function openLiveScreen(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: 'Fonds animés', exact: true }).click();
  await settings.getByRole('button', { name: /^Fonds animés/ }).click();
  return page.locator('.overlay-screen');
}

test.describe('fonds animés : options communes', () => {
  test('double-tap et pause en économie de batterie envoyés au natif', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const screen = await openLiveScreen(page);

    // L'option activée envoie la configuration par défaut : photo, pause éco, pas de double-tap.
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'image', eco: true, doubleTap: false });

    await screen.getByRole('switch', { name: 'Double-tap sur l’écran d’accueil' }).click();
    await expect.poll(async () => (await lastConfigure(page))?.doubleTap).toBe(true);
    // Le double-tap seul prépare la liste d'images, sans changement au déverrouillage.
    await expect.poll(() => lastPlaylist(page)).toMatchObject({ enabled: true, unlock: false });
    await expect(screen.getByText('Le double-tap passe aussi à l’image suivante de cette liste.')).toBeVisible();

    await screen.getByRole('switch', { name: 'Pause en économie de batterie' }).click();
    await expect.poll(async () => (await lastConfigure(page))?.eco).toBe(false);
  });

  test('fond figé en économie d’énergie : état affiché', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 1);
    const screen = await openLiveScreen(page);
    await screen.getByRole('button', { name: 'Choisir une image' }).click();
    await page.locator('.picker__item').first().click();
    await page.evaluate(() => {
      if (window.__prismeLiveWeb) window.__prismeLiveWeb.paused = true;
    });
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(screen.getByText('Le fond animé Prisme est actif, figé pour économiser la batterie.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeVisible();
  });
});
