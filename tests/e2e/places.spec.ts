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

/** Active « Selon le lieu » dans les réglages et ouvre son écran. */
async function openPlaces(page: Page) {
  const settings = await openSettings(page);
  await expect(settings.getByText('Un fond à la maison, un autre au travail')).toBeVisible();
  const option = settings.getByRole('switch', { name: 'Selon le lieu' });
  await expect(option).toHaveAttribute('aria-checked', 'false');
  await option.click();
  await settings.getByRole('button', { name: /Selon le lieu/ }).click();
  const screen = page.locator('.overlay-screen');
  await expect(screen.getByRole('heading', { name: 'Selon le lieu' })).toBeVisible();
  return screen;
}

const placesConfig = (page: Page) => page.evaluate(() => window.__prismeAutomationWeb?.config?.places ?? null);
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });

test.describe('selon le lieu', () => {
  test('un lieu avec sa position, son rayon et son fond arrive dans la configuration native', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const screen = await openPlaces(page);
    await expect(screen.getByText('Ajoute un lieu pour démarrer.')).toBeVisible();
    await expect.poll(async () => (await placesConfig(page))?.enabled).toBe(true);

    // Autorisations : rien d'accordé au départ, la demande les accorde (simulé).
    await expect(screen.getByText(/^Autorise la position précise/)).toBeVisible();
    await screen.getByRole('button', { name: 'Autoriser la position' }).click();
    await expect(screen.getByText('Autorisations de position accordées.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Autoriser la position' })).toHaveCount(0);
    expect(await page.evaluate(() => window.__prismeAutomationWeb?.locationRequests)).toBe(1);

    // Ajout : nom proposé, position simulée par l'implémentation web, rayon.
    const add = screen.getByRole('button', { name: 'Ajouter ce lieu' });
    await expect(add).toBeDisabled();
    await screen.getByRole('button', { name: 'Maison', exact: true }).click();
    await expect(screen.getByLabel('Nom du lieu')).toHaveValue('Maison');
    await expect(add).toBeDisabled();
    await screen.getByRole('button', { name: 'Utiliser ma position actuelle' }).click();
    await expect(screen.getByText('Position trouvée (± 25 m).')).toBeVisible();
    await screen.getByRole('group', { name: 'Rayon du nouveau lieu' }).getByRole('button', { name: '600 m' }).click();
    await add.click();

    // Le formulaire est vidé, le lieu apparaît sans fond : il n'est pas encore envoyé au natif.
    const card = screen.locator('.place-card');
    await expect(card).toHaveCount(1);
    await expect(card.getByText('Maison', { exact: true })).toBeVisible();
    await expect(card.getByText('Choisis un fond pour ce lieu')).toBeVisible();
    await expect(screen.getByLabel('Nom du lieu')).toHaveValue('');
    await expect(screen.getByRole('button', { name: 'Maison', exact: true })).toHaveCount(0);
    await expect(screen.getByText('Choisis un fond pour au moins un lieu.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Vérifier maintenant' })).toBeDisabled();
    expect((await placesConfig(page))?.items).toEqual([]);

    // Fond choisi parmi les favoris.
    await card.getByRole('button', { name: 'Choisir le fond « Maison »' }).click();
    await page.locator('.picker__item').first().click();
    await expect(card.getByRole('button', { name: 'Changer le fond « Maison »' })).toBeVisible();
    await expect(screen.getByText('1 lieu surveillé.')).toBeVisible();
    await expect.poll(() => placesConfig(page)).toMatchObject({
      enabled: true,
      target: 'both',
      items: [
        {
          name: 'Maison',
          latitude: 48.8566,
          longitude: 2.3522,
          radius: 600,
          item: { id: expect.stringMatching(/^unsplash:|^pexels:/), uri: expect.stringMatching(/^https:\/\/images\./) },
        },
      ],
    });

    // Écran visé, rayon d'un lieu existant.
    await screen.getByRole('button', { name: 'Verrouillage' }).click();
    await card.getByRole('group', { name: 'Rayon : Maison' }).getByRole('button', { name: '150 m' }).click();
    await expect.poll(() => placesConfig(page)).toMatchObject({ target: 'lock', items: [{ radius: 150 }] });

    // Vérification immédiate de la position, sans attendre le prochain contrôle.
    await screen.getByRole('button', { name: 'Vérifier maintenant' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeAutomationWeb?.runs)).toBe(1);

    // Désactiver l'option coupe l'automatisme côté natif.
    await screen.getByRole('switch', { name: 'Activer « Selon le lieu »' }).click();
    await expect.poll(async () => (await placesConfig(page))?.enabled).toBe(false);
  });

  test('plusieurs lieux : position introuvable, ordre de la liste, suppression annulable', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const screen = await openPlaces(page);
    const add = screen.getByRole('button', { name: 'Ajouter ce lieu' });
    const locate = screen.getByRole('button', { name: 'Utiliser ma position actuelle' });
    const setPosition = (position: { latitude: number; longitude: number } | null) =>
      page.evaluate((p) => {
        if (window.__prismeAutomationWeb) window.__prismeAutomationWeb.position = p;
      }, position);

    await screen.getByLabel('Nom du lieu').fill('Chez Camille');
    await locate.click();
    await expect(screen.getByText('Position trouvée (± 25 m).')).toBeVisible();
    await add.click();

    // Position introuvable : message, rien n'est ajouté.
    await setPosition(null);
    await screen.getByRole('button', { name: 'Travail', exact: true }).click();
    await locate.click();
    await expect(snackbar(page, 'Position introuvable')).toBeVisible();
    await expect(add).toBeDisabled();

    await setPosition({ latitude: 48.8738, longitude: 2.295 });
    await locate.click();
    await expect(screen.getByText('Position trouvée.')).toBeVisible();
    await add.click();

    const cards = screen.locator('.place-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByText('Chez Camille')).toBeVisible();
    await expect(cards.nth(1).getByText('Travail', { exact: true })).toBeVisible();
    await expect(screen.getByText('Si des zones se recouvrent, le premier lieu de la liste l’emporte.')).toBeVisible();
    // Le nom déjà pris n'est plus proposé.
    await expect(screen.getByRole('button', { name: 'Travail', exact: true })).toHaveCount(0);

    // Seul un lieu avec un fond est envoyé ; l'ordre de la liste est conservé.
    await cards.nth(1).getByRole('button', { name: 'Choisir le fond « Travail »' }).click();
    await page.locator('.picker__item').nth(1).click();
    await cards.nth(0).getByRole('button', { name: 'Choisir le fond « Chez Camille »' }).click();
    await page.locator('.picker__item').first().click();
    await expect.poll(async () => (await placesConfig(page))?.items.map((i) => i.name)).toEqual(['Chez Camille', 'Travail']);
    expect((await placesConfig(page))?.items[1]).toMatchObject({ latitude: 48.8738, longitude: 2.295, radius: 300 });

    // Suppression, puis annulation : le lieu revient à sa place.
    await cards.nth(0).getByRole('button', { name: 'Supprimer le lieu « Chez Camille »' }).click();
    await expect(cards).toHaveCount(1);
    await expect.poll(async () => (await placesConfig(page))?.items.map((i) => i.name)).toEqual(['Travail']);
    await snackbar(page, 'Lieu « Chez Camille » supprimé').getByRole('button', { name: 'Annuler' }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByText('Chez Camille')).toBeVisible();
    await expect.poll(async () => (await placesConfig(page))?.items.map((i) => i.name)).toEqual(['Chez Camille', 'Travail']);
  });

  test('accès « Toujours » manquant : la consigne s’affiche', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openPlaces(page);
    await expect(screen.getByText(/^Autorise la position précise/)).toBeVisible();

    // Position précise accordée, pas l'accès « Toujours » : sans lui, rien n'est lu app fermée.
    await page.evaluate(() => {
      if (window.__prismeAutomationWeb) window.__prismeAutomationWeb.locationPermissions = { precise: true, background: false };
    });
    await screen.getByRole('button', { name: 'Utiliser ma position actuelle' }).click();
    await expect(screen.getByText(/^Choisis « Toujours autoriser » pour la position/)).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Autoriser la position' })).toBeVisible();

    await screen.getByRole('button', { name: 'Autoriser la position' }).click();
    await expect(screen.getByText('Autorisations de position accordées.')).toBeVisible();
  });

  test('autorisation refusée : la position n’est pas utilisée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openPlaces(page);
    await expect(screen.getByText(/^Autorise la position précise/)).toBeVisible();
    await page.evaluate(() => {
      if (window.__prismeAutomationWeb) window.__prismeAutomationWeb.grantLocation = false;
    });

    await screen.getByRole('button', { name: 'Autoriser la position' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeAutomationWeb?.locationRequests)).toBe(1);
    await expect(screen.getByText(/^Autorise la position précise/)).toBeVisible();

    await screen.getByLabel('Nom du lieu').fill('Maison');
    await screen.getByRole('button', { name: 'Utiliser ma position actuelle' }).click();
    await expect(snackbar(page, 'Autorisation de position précise refusée')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Ajouter ce lieu' })).toBeDisabled();
    await expect(screen.locator('.place-card')).toHaveCount(0);
  });
});
