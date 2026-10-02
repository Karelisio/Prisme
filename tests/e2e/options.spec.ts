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
  await settings.getByRole('switch', { name: 'Fonds animés', exact: true }).click();
  await settings.getByRole('button', { name: /^Fonds animés/ }).click();
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
  await screen.getByRole('button', { name: 'Favoris (3)' }).click();
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

test('éditeur : retouche, enregistrement dans « Créations » et application', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Éditeur' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.tab[data-active="true"] .wp-cell').first().click();
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.getByRole('button', { name: 'Retoucher' }).click();

  const editor = page.getByRole('dialog', { name: 'Éditeur' });
  await expect(editor.locator('.editor__loading')).toHaveCount(0);
  await editor.getByLabel('Intensité du flou').fill('0.5');
  await editor.getByRole('tab', { name: 'Texte' }).click();
  await editor.getByLabel('Texte', { exact: true }).fill('Bonjour');
  await editor.getByRole('tab', { name: 'Grain' }).click();
  await editor.getByLabel('Grain').fill('0.4');
  const alpha = await editor.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d')!;
    return ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3];
  });
  expect(alpha).toBe(255);

  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' })).toBeVisible();

  await editor.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: "Écran d'accueil" }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied.at(-1)?.uri).toMatch(/^blob:/);
  expect(applied.at(-1)?.target).toBe('home');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  const library = page.locator('.tab[data-active="true"]');
  await library.getByRole('radio', { name: 'Collections' }).click();
  await expect(library.getByRole('button', { name: /Créations/ })).toContainText('2 fonds');
});

test('générateur : style, palette Material You, enregistrement et application', async ({ page }, info) => {
  await mockApis(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Créer' })).toHaveCount(0);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Générateur minimaliste' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.getByRole('button', { name: 'Créer' }).click();

  const generator = page.getByRole('dialog', { name: 'Générateur' });
  await generator.getByRole('button', { name: 'Vagues' }).click();
  await generator.getByRole('button', { name: 'Palette Material You' }).click();
  await expect(generator.getByRole('button', { name: 'Palette Material You' })).toHaveAttribute('aria-pressed', 'true');
  await generator.getByLabel('Grain').fill('0.3');
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('generator.png') });

  await generator.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' })).toBeVisible();
  await generator.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: 'Accueil et verrouillage' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied.at(-1)).toMatchObject({ target: 'both' });
  expect(applied.at(-1)?.uri).toMatch(/^blob:/);
});

test('palette Material You : couleurs calculées et simulation de l’accueil', async ({ page }, info) => {
  await mockApis(page);
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Palette Material You' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.tab[data-active="true"] .wp-cell').first().click();
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.getByRole('button', { name: 'Couleurs Material You' }).click();

  const sheet = page.getByRole('dialog', { name: 'Couleurs Material You' });
  await expect(sheet.getByRole('radio', { name: 'Couleur source 1' })).toBeVisible();
  await expect(sheet.getByLabel("Aperçu de l'interface")).toBeVisible();
  await sheet.getByRole('radio', { name: 'Sombre' }).click();
  await page.screenshot({ path: info.outputPath('palette.png') });
  await sheet.getByRole('button', { name: "Voir sur l'écran d'accueil" }).click();

  const preview = page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
  await expect(preview.locator('.sim-home__icon').first()).toBeVisible();
  const iconBg = await preview.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--sim-icon-bg'));
  expect(iconBg).toMatch(/^#[0-9a-f]{6}$/i);
});

test('fonds liés : variante assortie sur l’autre écran', async ({ page }, info) => {
  await mockApis(page);
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Fonds accueil et verrouillage liés' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.tab[data-active="true"] .wp-cell').first().click();
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: /Accueil et verrouillage assortis/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Fonds assortis' });
  await expect(sheet.getByLabel("Écran d'accueil")).toBeVisible();
  await expect(sheet.getByLabel('Écran de verrouillage')).toBeVisible();
  await sheet.getByRole('button', { name: 'Gros plan' }).click();
  await sheet.getByRole('radio', { name: 'Variante à l’accueil' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('linked.png') });
  await sheet.getByRole('button', { name: 'Appliquer les deux' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fonds assortis appliqués' })).toBeVisible();

  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied).toHaveLength(2);
  expect(applied[0]).toMatchObject({ target: 'home' });
  expect(applied[0]?.uri).toMatch(/^blob:/);
  expect(applied[1]).toMatchObject({ target: 'lock' });
  expect(applied[1]?.uri).toContain('fm=jpg');
});

test('mode focus : fond épuré, plages horaires et écran visé', async ({ page }, info) => {
  await mockApis(page);
  await page.goto('/');
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Mode focus' }).click();
  await settings.getByRole('button', { name: /Mode focus/ }).click();
  const screen = page.locator('.overlay-screen');
  await expect(screen.getByText('Choisis un fond épuré pour démarrer.')).toBeVisible();

  await screen.getByRole('button', { name: 'Fond épuré Ardoise' }).click();
  await expect(screen.getByRole('button', { name: 'Changer le fond « Fond choisi »' })).toBeVisible();

  // Plage existante : du lundi au vendredi, on ajoute le samedi et on change les heures.
  const first = screen.locator('.schedule').first();
  await first.getByRole('button', { name: 'Samedi' }).click();
  await first.getByLabel('Début').fill('08:00');
  await first.getByLabel('Fin').fill('11:30');
  await screen.getByRole('button', { name: 'Ajouter une plage' }).click();
  const second = screen.locator('.schedule').nth(1);
  await second.getByLabel('Début').fill('22:00');
  await second.getByLabel('Fin').fill('07:00');
  await expect(second.getByText('Se termine le lendemain.')).toBeVisible();
  await screen.getByRole('button', { name: 'Verrouillage' }).click();
  await page.screenshot({ path: info.outputPath('focus.png'), fullPage: false });

  await expect.poll(async () => (await automationConfig(page))?.focus).toMatchObject({
    enabled: true,
    target: 'lock',
    schedules: [
      { days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '11:30' },
      { days: [1, 2, 3, 4, 5], start: '22:00', end: '07:00' },
    ],
  });
  expect((await automationConfig(page))?.focus.item?.uri).toMatch(/^blob:/);

  await screen.getByRole('button', { name: 'Essayer maintenant' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fond épuré appliqué' })).toBeVisible();
  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied.at(-1)).toMatchObject({ target: 'lock', remember: false });
});
