import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const playlistCalls = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.playlistCalls ?? []);

async function addFavorites(page: Page, indexes: number[]) {
  for (const i of indexes) {
    await cells(page).nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

/** Active l'option « Fond animé », ouvre son écran et choisit la première image du sélecteur. */
async function openLiveScreen(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: 'Fond animé (parallaxe)' }).click();
  await settings.getByRole('button', { name: /Fond animé \(parallaxe\)/ }).click();
  const screen = page.locator('.overlay-screen');
  await screen.getByRole('button', { name: 'Choisir une image' }).click();
  await page.locator('.picker__item').first().click();
  return screen;
}

async function activateLive(page: Page, screen: ReturnType<Page['locator']>) {
  await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confirme dans l’écran Android' })).toBeVisible();
}

test.describe('fond animé : changer à chaque déverrouillage', () => {
  test('liste, fréquence et source envoyées au natif, renvoyées quand les favoris changent', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, [0, 1, 2]);

    const screen = await openLiveScreen(page);
    const toggle = screen.getByRole('switch', { name: 'Changer à chaque déverrouillage' });

    // Le fond animé Prisme n'est pas encore actif : explication, et rien ne peut être activé.
    await expect(screen.getByText(/Active d’abord le fond animé Prisme/)).toBeVisible();
    await expect(toggle).toBeDisabled();
    await activateLive(page, screen);
    await expect(screen.getByText(/Active d’abord le fond animé Prisme/)).toBeHidden();
    await expect(toggle).toBeEnabled();
    expect(await playlistCalls(page)).toEqual([]);

    // Fréquence : « Chaque fois », « 3 », « 5 » et « 10 » déverrouillages.
    await expect(screen.getByRole('button', { name: 'Chaque fois' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['3', '5', '10']) await expect(screen.getByRole('button', { name: label, exact: true })).toBeVisible();
    await screen.getByRole('button', { name: '5', exact: true }).click();
    await expect(screen.getByText('Une nouvelle image tous les 5 déverrouillages')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Favoris (3)' })).toHaveAttribute('aria-pressed', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await playlistCalls(page)).length).toBe(1);
    const [first] = await playlistCalls(page);
    expect(first).toMatchObject({ enabled: true, every: 5 });
    expect(first?.items).toHaveLength(3);
    for (const item of first?.items ?? []) {
      expect(item.id).toMatch(/^unsplash:|^pexels:/);
      expect(item.uri).toMatch(/^https:\/\/images\./);
    }
    expect(new Set(first?.items.map((i) => i.id)).size).toBe(3);
    // Le natif prépare les images : l'état s'affiche.
    await expect(screen.getByText('3 fonds prêts, disponibles sans connexion.')).toBeVisible();

    // Un réglage identique ne renvoie rien ; une autre fréquence renvoie la liste.
    await screen.getByRole('button', { name: '5', exact: true }).click();
    await page.waitForTimeout(900);
    expect(await playlistCalls(page)).toHaveLength(1);
    await screen.getByRole('button', { name: 'Chaque fois' }).click();
    await expect.poll(async () => (await playlistCalls(page)).length).toBe(2);
    expect((await playlistCalls(page))[1]).toMatchObject({ enabled: true, every: 1 });

    // Un favori de plus : la liste est renvoyée, écran fermé.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Explorer' }).click();
    await addFavorites(page, [3]);
    await expect.poll(async () => (await playlistCalls(page)).length).toBe(3);
    const third = (await playlistCalls(page))[2];
    expect(third?.items).toHaveLength(4);
    expect(third?.items.map((i) => i.id)).toEqual(expect.arrayContaining(first?.items.map((i) => i.id) ?? []));

    // Source : une collection (le dernier fond ajouté et un favori), au lieu des favoris.
    await cells(page).nth(0).click();
    await page.getByRole('button', { name: 'Ajouter à une collection' }).click();
    await page.getByRole('button', { name: 'Nouvelle collection' }).click();
    await page.getByLabel('Nom de la collection').fill('Nuit');
    await page.getByRole('button', { name: 'Créer' }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await cells(page).nth(4).click();
    await page.getByRole('button', { name: 'Ajouter à une collection' }).click();
    await page.getByRole('button', { name: /Nuit/ }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.locator('.tab[data-active="true"]').getByRole('button', { name: /Fond animé \(parallaxe\)/ }).click();
    const again = page.locator('.overlay-screen');
    await again.getByRole('button', { name: /^Nuit \(2\)/ }).click();
    await expect(again.getByRole('button', { name: /^Nuit \(2\)/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await playlistCalls(page)).at(-1)?.items.length).toBe(2);
    const collection = (await playlistCalls(page)).at(-1);
    expect(collection).toMatchObject({ enabled: true, every: 1 });
    const favoriteIds = third?.items.map((i) => i.id) ?? [];
    expect(collection?.items.filter((i) => favoriteIds.includes(i.id))).toHaveLength(1);

    // Les réglages survivent au rechargement, la liste repart au natif.
    await page.reload();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await page.locator('.tab[data-active="true"]').getByRole('button', { name: /Fond animé \(parallaxe\)/ }).click();
    const reloaded = page.locator('.overlay-screen');
    await expect(reloaded.getByRole('switch', { name: 'Changer à chaque déverrouillage' })).toHaveAttribute('aria-checked', 'true');
    await expect(reloaded.getByRole('button', { name: /^Nuit \(2\)/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await playlistCalls(page)).at(-1)).toMatchObject({ enabled: true, every: 1 });

    // Désactivé : la liste est vidée côté natif.
    await reloaded.getByRole('switch', { name: 'Changer à chaque déverrouillage' }).click();
    await expect.poll(async () => (await playlistCalls(page)).at(-1)).toEqual({ enabled: false, every: 1, items: [] });
  });

  test('moins de deux fonds : message d’aide et rien d’envoyé', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, [0]);

    const screen = await openLiveScreen(page);
    await activateLive(page, screen);
    const toggle = screen.getByRole('switch', { name: 'Changer à chaque déverrouillage' });
    await expect(screen.getByText('Il faut au moins deux fonds dans la source choisie.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Favoris (1)' })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(screen.getByText('Il faut au moins deux fonds dans la source choisie.')).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await playlistCalls(page)).toEqual([]);

    // Un deuxième fond : la liste part toute seule.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Explorer' }).click();
    await addFavorites(page, [1]);
    await expect.poll(async () => (await playlistCalls(page)).length).toBe(1);
    expect((await playlistCalls(page))[0]).toMatchObject({ enabled: true, every: 1 });
    expect((await playlistCalls(page))[0]?.items).toHaveLength(2);
  });
});
