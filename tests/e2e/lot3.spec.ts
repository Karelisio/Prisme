import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const topOverlay = (page: Page) => page.locator('.overlay-layer').last();
const automationConfig = (page: Page) => page.evaluate(() => window.__prismeAutomationWeb?.config ?? null);

async function addFavorites(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await cells(page).nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

/** Active une option avancée puis ouvre son écran. */
async function openOption(page: Page, title: string) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: title, exact: true }).click();
  await settings.getByRole('button', { name: new RegExp(title) }).click();
  return topOverlay(page);
}

test.describe('lot 3 : automatismes', () => {
  test('fonds dynamiques : suivre le soleil, puis mode sombre', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const screen = await openOption(page, 'Fonds dynamiques');

    await screen.getByRole('switch', { name: 'Suivre le soleil' }).click();
    await expect(screen.getByText('Choisis un lieu puis des fonds.')).toBeVisible();
    await screen.getByLabel('Ville').fill('Lyon');
    await screen.getByRole('button', { name: 'Rechercher' }).click();
    await screen.getByRole('button', { name: /Lyon, Auvergne/ }).click();
    await expect(screen.getByText(/^Aujourd’hui : lever \d\d:\d\d, coucher \d\d:\d\d\./)).toBeVisible();
    await screen.getByRole('button', { name: 'Choisir le fond « Nuit »' }).click();
    await page.locator('.picker__item').first().click();
    await expect.poll(async () => (await automationConfig(page))?.dynamic.time).toMatchObject({
      sun: { latitude: 45.76, longitude: 4.84 },
      slots: [{ anchor: 'sunset', offset: 40 }],
    });

    await screen.getByRole('radio', { name: 'Mode sombre' }).click();
    await screen.getByRole('button', { name: 'Choisir le fond « Thème sombre »' }).click();
    await page.locator('.picker__item').nth(1).click();
    await expect.poll(async () => (await automationConfig(page))?.dynamic).toMatchObject({ mode: 'theme', theme: { dark: { uri: expect.any(String) } } });
  });

  test('fêtes et dates perso : fête suivie avec un fond choisi, date perso en ligne', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 1);
    const screen = await openOption(page, 'Fêtes et dates perso');
    await expect(screen.getByText(/^Prochain : /)).toBeVisible();

    await screen.getByRole('button', { name: 'Saint-Valentin', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir le fond « Noël »' }).click();
    await page.locator('.picker__item').first().click();
    await screen.getByLabel('Nom', { exact: true }).fill('Anniversaire de Léa');
    await screen.getByLabel('Date', { exact: true }).fill('2026-03-14');
    await screen.getByLabel('Thème en ligne (sans fond choisi)').fill('birthday cake');
    await screen.getByRole('button', { name: 'Ajouter la date' }).click();
    await expect(screen.getByText('Anniversaire de Léa')).toBeVisible();

    await expect.poll(async () => (await automationConfig(page))?.events?.items[0]?.name).toBe('Anniversaire de Léa');
    const events = (await automationConfig(page))?.events;
    expect(events?.enabled).toBe(true);
    expect(events?.items[0]?.dates[0]).toMatch(/-03-14$/);
    expect(events?.items[0]?.queries).toContainEqual({ provider: 'unsplash', query: 'birthday cake', auth: 'Client-ID e2e-unsplash' });
    expect(events?.items.map((e) => e.id)).not.toContain('valentine');
    expect(events?.items.find((e) => e.id === 'christmas')?.item?.uri).toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  test('assombrir le soir : intensité et lieu', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openOption(page, 'Assombrir le soir');
    await expect(screen.getByText(/^Ce soir : à partir de 21:00, jusqu’à 40 %/)).toBeVisible();
    await screen.getByRole('button', { name: 'Fort (55 %)' }).click();
    await screen.getByLabel('Ville').fill('Lyon');
    await screen.getByRole('button', { name: 'Rechercher' }).click();
    await screen.getByRole('button', { name: /Lyon, Auvergne/ }).click();
    await expect(screen.getByText(/^Ce soir : à partir de \d\d:\d\d, jusqu’à 55 %/)).toBeVisible();
    await expect.poll(async () => (await automationConfig(page))?.dim).toEqual({ enabled: true, max: 0.55, sun: { latitude: 45.76, longitude: 4.84 } });
  });

  test('rotation : intelligente par défaut, puis depuis un dossier du téléphone', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 3);
    const screen = await openOption(page, 'Rotation automatique');
    await screen.getByRole('button', { name: 'Favoris (3)' }).click();
    await expect(screen.getByRole('switch', { name: 'Rotation intelligente' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await automationConfig(page))?.rotation).toMatchObject({ smart: true, items: [{ color: expect.any(String) }, {}, {}] });

    await screen.getByRole('button', { name: 'Dossier du téléphone…' }).click();
    await expect(screen.getByText(/^12 photos du dossier en rotation/)).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Dossier « Camera »' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await automationConfig(page))?.rotation).toMatchObject({ folder: 'content://test/tree/Camera', items: [] });
  });
});
