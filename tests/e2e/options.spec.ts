import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

async function addFavorites(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.locator('.tab[data-active="true"] .wp-cell').nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return page.locator('.tab[data-active="true"]');
}

const automationConfig = (page: Page) => page.evaluate(() => window.__prismeAutomationWeb?.config ?? null);

test.describe('options avancées', () => {
  test('toutes les options sont désactivées par défaut', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    const switches = settings.locator('.option-row [role="switch"]');
    await expect(switches.first()).toBeVisible();
    for (const s of await switches.all()) await expect(s).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await automationConfig(page))?.dynamic.enabled).toBe(false);
  });

  test('fonds dynamiques : créneaux horaires, météo par ville, batterie', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const settings = await openSettings(page);
    await settings.getByRole('switch', { name: 'Fonds dynamiques' }).click();
    await settings.getByRole('button', { name: /Fonds dynamiques/ }).click();
    const screen = page.locator('.overlay-screen');
    await expect(screen.getByRole('heading', { name: 'Fonds dynamiques' })).toBeVisible();

    await screen.getByRole('button', { name: 'Choisir le fond « Matin »' }).click();
    await page.locator('.picker__item').first().click();
    await screen.getByRole('button', { name: 'Choisir le fond « Nuit »' }).click();
    await page.locator('.picker__item').nth(1).click();
    await screen.getByLabel('Début : Nuit').fill('21:30');

    await expect.poll(async () => (await automationConfig(page))?.dynamic).toMatchObject({
      enabled: true,
      mode: 'time',
      time: { slots: [{ start: '06:00' }, { start: '21:30' }] },
    });

    await screen.getByRole('radio', { name: 'Météo' }).click();
    await screen.getByLabel('Ville').fill('Lyon');
    await screen.getByRole('button', { name: 'Rechercher' }).click();
    await screen.getByRole('button', { name: /Lyon, Auvergne/ }).click();
    await expect(screen.getByText('Actuellement : Pluie')).toBeVisible();
    await screen.getByRole('button', { name: 'Choisir le fond « Pluie »' }).click();
    await page.locator('.picker__item').first().click();
    await expect.poll(async () => (await automationConfig(page))?.dynamic.weather).toMatchObject({
      latitude: 45.76,
      longitude: 4.84,
      items: { rain: { id: expect.stringMatching(/^unsplash:|^pexels:/) } },
    });

    await screen.getByRole('radio', { name: 'Batterie' }).click();
    await screen.getByRole('button', { name: 'Choisir le fond « En charge »' }).click();
    await page.locator('.picker__item').first().click();
    await expect.poll(async () => (await automationConfig(page))?.dynamic.battery?.charging?.uri).toMatch(/^https:\/\/images\./);

    await screen.getByRole('button', { name: 'Appliquer maintenant' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeAutomationWeb?.runs)).toBe(1);

    // Désactiver l'option coupe l'automatisme côté natif.
    await screen.getByRole('switch', { name: 'Activer les fonds dynamiques' }).click();
    await expect.poll(async () => (await automationConfig(page))?.dynamic.enabled).toBe(false);
  });
});

test('fond animé : réglage de l’intensité et application depuis l’aperçu', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 1);

  // Option désactivée : pas de choix « fond animé » dans la feuille d'application.
  await page.locator('.tab[data-active="true"] .wp-cell').first().click();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.getByRole('button', { name: /Fond animé/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Fond animé (parallaxe)' }).click();
  await settings.getByRole('button', { name: /Fond animé \(parallaxe\)/ }).click();
  const screen = page.locator('.overlay-screen');
  await screen.getByRole('button', { name: 'Choisir une image' }).click();
  await page.locator('.picker__item').first().click();
  await screen.getByLabel('Intensité de la parallaxe').fill('0.8');
  await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confirme dans l’écran Android' })).toBeVisible();
  const calls = await page.evaluate(() => window.__prismeLiveWeb?.calls ?? []);
  expect(calls[0]?.intensity).toBeCloseTo(0.8);
  expect(calls[0]?.uri).toMatch(/^https:\/\/images\./);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.tab[data-active="true"] .wp-cell').nth(2).click();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: /Fond animé \(parallaxe\)/ }).click();
  await expect.poll(() => page.evaluate(() => window.__prismeLiveWeb?.calls.length)).toBe(2);
});

test('rotation : source, intervalle, écran et changement immédiat', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 3);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Rotation automatique' }).click();
  await settings.getByRole('button', { name: /Rotation automatique/ }).click();
  const screen = page.locator('.overlay-screen');
  await expect(screen.getByText('3 fonds en rotation')).toBeVisible();
  await screen.getByRole('button', { name: '3 h' }).click();
  await screen.getByRole('switch', { name: 'Ordre aléatoire' }).click();
  await screen.getByRole('button', { name: 'Verrouillage' }).click();
  await expect.poll(async () => (await automationConfig(page))?.rotation).toMatchObject({
    enabled: true,
    intervalMinutes: 180,
    shuffle: false,
    target: 'lock',
  });
  expect((await automationConfig(page))?.rotation.items).toHaveLength(3);
  await screen.getByRole('button', { name: 'Changer maintenant' }).click();
  await expect.poll(() => page.evaluate(() => window.__prismeAutomationWeb?.rotations)).toBe(1);
});
