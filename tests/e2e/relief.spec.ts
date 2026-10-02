import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const cells = (page: Page) => page.locator('.tab[data-active="true"] .wp-cell');
const lastConfigure = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.configureCalls.at(-1) ?? null);
const reliefCalls = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.reliefCalls ?? []);

/** La prochaine préparation du relief échouera avec cette erreur du natif. */
const failNextRelief = (page: Page, code: string, message: string) =>
  page.evaluate(
    ([code, message]) => {
      if (window.__prismeLiveWeb) window.__prismeLiveWeb.reliefError = { code, message };
    },
    [code, message] as const,
  );

async function addFavorites(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await cells(page).nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

/** Active l'option « Fonds animés », ouvre son écran et choisit le genre « Relief 3D ». */
async function openRelief(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: 'Fonds animés', exact: true }).click();
  await settings.getByRole('button', { name: /^Fonds animés/ }).click();
  const screen = page.locator('.overlay-screen');
  await screen.getByRole('button', { name: 'Relief 3D', exact: true }).click();
  return screen;
}

test.describe('fond animé : relief 3D', () => {
  test('photo choisie, relief préparé, profondeur et ombre, activation', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 1);
    const screen = await openRelief(page);
    // Le genre est envoyé au natif dès qu'il est choisi.
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'relief' });
    await expect(screen.getByRole('button', { name: 'Relief 3D', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const prepare = screen.getByRole('button', { name: 'Préparer le relief' });
    const activate = screen.getByRole('button', { name: 'Activer le fond animé' });
    // Rien n'est prêt : pas de préparation sans photo, pas d'activation sans relief.
    await expect(prepare).toBeDisabled();
    await expect(activate).toBeDisabled();

    await screen.getByRole('button', { name: 'Choisir une photo' }).click();
    await page.locator('.picker__item').first().click();
    await expect(screen.getByRole('button', { name: 'Changer de photo' })).toBeVisible();
    await expect(prepare).toBeEnabled();
    await expect(activate).toBeDisabled();

    // Étapes simulées assez longues pour être vues : photo, module (50 %), détourage, comblement.
    await page.evaluate(() => {
      if (window.__prismeLiveWeb) window.__prismeLiveWeb.reliefStepMs = 2000;
    });
    await prepare.click();
    // Étapes annoncées par le natif pendant la préparation ; les boutons attendent la fin.
    await expect(screen.getByText('Téléchargement du module de détourage… 50 %')).toBeVisible();
    await expect(screen.getByRole('progressbar', { name: 'Préparation du relief' })).toHaveAttribute('aria-valuenow', '50');
    await expect(screen.getByText('Détourage du sujet…')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Préparation…' })).toBeDisabled();
    await expect(activate).toBeDisabled();
    await expect(screen.getByRole('img', { name: 'Sujet détouré' })).toBeVisible({ timeout: 10_000 });
    await expect(screen.getByText('Relief prêt : le sujet a été détouré et le fond comblé derrière lui.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Relief prêt' })).toBeVisible();
    const calls = await reliefCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.uri).toMatch(/^https:\/\/images\./);

    // Profondeur (curseur au clavier) et ombre : réglages de la scène envoyés au natif.
    const depth = screen.getByRole('slider', { name: 'Profondeur' });
    await expect(depth).toHaveValue('0.5');
    await depth.focus();
    for (let i = 0; i < 6; i++) await depth.press('ArrowRight');
    await expect(depth).toHaveValue('0.8');
    await expect.poll(async () => (await lastConfigure(page))?.settings).toMatchObject({ depth: 0.8 });
    const shadow = screen.getByRole('switch', { name: 'Ombre sous le sujet' });
    await expect(shadow).toHaveAttribute('aria-checked', 'true');
    await shadow.click();
    await expect.poll(async () => (await lastConfigure(page))?.settings).toEqual({ depth: 0.8, shadow: false });

    await activate.click();
    await expect(page.getByRole('status').filter({ hasText: 'Confirme dans l’écran Android' })).toBeVisible();
    expect(await page.evaluate(() => window.__prismeLiveWeb?.activated)).toBe(true);
    expect(await lastConfigure(page)).toMatchObject({ mode: 'relief', settings: { depth: 0.8, shadow: false } });
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeEnabled();
  });

  test('erreurs de préparation affichées, nouvelle photo à préparer avant d’activer', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await addFavorites(page, 2);
    const screen = await openRelief(page);
    await screen.getByRole('button', { name: 'Choisir une photo' }).click();
    await page.locator('.picker__item').first().click();
    const prepare = screen.getByRole('button', { name: 'Préparer le relief' });
    const activate = screen.getByRole('button', { name: 'Activer le fond animé' });
    const error = screen.getByRole('alert');

    // Hors ligne au premier usage : le module de détourage n'est pas encore là.
    await failNextRelief(page, 'MODULE_DOWNLOADING', 'Téléchargement du module en cours, réessaie dans un instant');
    await prepare.click();
    await expect(error).toHaveText('Téléchargement du module en cours, réessaie dans un instant');
    await expect(prepare).toBeEnabled();
    await expect(activate).toBeDisabled();

    // Sans Play services.
    await failNextRelief(page, 'UNSUPPORTED', 'Relief 3D indisponible sur cet appareil');
    await prepare.click();
    await expect(error).toHaveText('Relief 3D indisponible sur cet appareil');

    // Aucun sujet sur la photo.
    await failNextRelief(page, 'NO_SUBJECT', 'Aucun sujet détecté sur cette photo : choisis-en une avec un sujet net au premier plan');
    await prepare.click();
    await expect(error).toHaveText(/^Aucun sujet détecté/);
    await expect(screen.getByRole('img', { name: 'Sujet détouré' })).toHaveCount(0);

    // Nouvel essai réussi : l'erreur disparaît, l'activation devient possible.
    await prepare.click();
    await expect(screen.getByRole('img', { name: 'Sujet détouré' })).toBeVisible();
    await expect(error).toHaveCount(0);
    await expect(activate).toBeEnabled();
    expect(await reliefCalls(page)).toHaveLength(4);

    // Une autre photo : son relief doit être préparé avant l'activation.
    await screen.getByRole('button', { name: 'Changer de photo' }).click();
    await page.locator('.picker__item').nth(1).click();
    await expect(activate).toBeDisabled();
    await expect(screen.getByRole('img', { name: 'Sujet détouré' })).toHaveCount(0);
    await prepare.click();
    await expect(activate).toBeEnabled();
    const calls = await reliefCalls(page);
    expect(calls).toHaveLength(5);
    expect(calls[4]?.uri).not.toBe(calls[3]?.uri);
  });
});
