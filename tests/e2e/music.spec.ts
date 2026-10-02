import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const topOverlay = (page: Page) => page.locator('.overlay-layer').last();
const musicConfigs = (page: Page) => page.evaluate(() => window.__prismeMusicWeb?.configs ?? []);
const lastConfig = async (page: Page) => (await musicConfigs(page)).at(-1);
/** Laisse le temps à l'écran de relire l'état du natif (toutes les 2 s). */
const STATUS = { timeout: 10_000 };

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  return page.locator('.tab[data-active="true"]');
}

/** Active l'option dans Réglages › Options avancées puis ouvre son écran. */
async function openMusicScreen(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Pochette de la musique' }).click();
  await settings.getByRole('button', { name: /Pochette de la musique/ }).click();
  const screen = topOverlay(page);
  await expect(screen.getByRole('heading', { name: "Pochette d'album" })).toBeVisible();
  return screen;
}

test.describe('pochette de la musique', () => {
  test('option avancée désactivée par défaut, activée depuis les réglages', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    const option = settings.getByRole('switch', { name: 'Pochette de la musique' });
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute('aria-checked', 'false');
    await expect(settings.getByText('Le fond devient la pochette du morceau en cours')).toBeVisible();

    // Au lancement le natif apprend que l'option est coupée, avec les réglages par défaut.
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: false, target: 'both', restore: true });

    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'both', restore: true });
    await option.click();
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: false, target: 'both', restore: true });
  });

  test('accès aux notifications requis : le bouton ouvre les réglages, puis « Prêt »', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openMusicScreen(page);

    // Accès non accordé : on le demande, avec un bouton qui ouvre les réglages Android.
    const status = screen.getByRole('status');
    await expect(status).toContainText("Autorise l'accès aux notifications", STATUS);
    expect(await page.evaluate(() => window.__prismeMusicWeb?.settingsOpened)).toBe(0);
    await screen.getByRole('button', { name: 'Ouvrir les réglages' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeMusicWeb?.settingsOpened)).toBe(1);

    // Retour de l'écran des réglages Android avec l'accès accordé : l'état est relu tout seul.
    await page.evaluate(() => {
      if (window.__prismeMusicWeb) window.__prismeMusicWeb.accessGranted = true;
    });
    await expect(status).toContainText("Prêt : la pochette s'affiche dès qu'une musique joue", STATUS);
    await expect(screen.getByRole('button', { name: 'Ouvrir les réglages' })).toHaveCount(0);

    // Une pochette est posée en ce moment.
    await page.evaluate(() => {
      if (window.__prismeMusicWeb) window.__prismeMusicWeb.showing = true;
    });
    await expect(status).toContainText('Pochette affichée en ce moment', STATUS);

    // Option coupée depuis l'interrupteur de l'écran : annoncée, et transmise au natif.
    await screen.getByRole('switch', { name: 'Activer la pochette de la musique' }).click();
    await expect(status).toContainText('Option désactivée', STATUS);
    await expect.poll(async () => (await lastConfig(page))?.enabled).toBe(false);
  });

  test('écran visé et retour au fond précédent envoyés au natif, gardés au redémarrage', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openMusicScreen(page);
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'both', restore: true });

    // Par défaut : les deux écrans, retour au fond précédent activé.
    await expect(screen.getByRole('button', { name: 'Les deux' })).toHaveAttribute('aria-pressed', 'true');
    const restore = screen.getByRole('switch', { name: 'Revenir au fond précédent' });
    await expect(restore).toHaveAttribute('aria-checked', 'true');

    await screen.getByRole('button', { name: 'Verrouillage' }).click();
    await expect(screen.getByRole('button', { name: 'Verrouillage' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'lock', restore: true });

    await restore.click();
    await expect(restore).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'lock', restore: false });

    await screen.getByRole('button', { name: 'Accueil' }).click();
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'home', restore: false });

    // Rechargement de l'app : les choix reviennent, et le natif les reçoit de nouveau au lancement.
    await page.reload();
    await expect.poll(() => lastConfig(page)).toEqual({ enabled: true, target: 'home', restore: false });
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Pochette de la musique/ }).click();
    const again = topOverlay(page);
    await expect(again.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-pressed', 'true');
    await expect(again.getByRole('switch', { name: 'Revenir au fond précédent' })).toHaveAttribute('aria-checked', 'false');
  });
});
