import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

type Media = { name: string; sizeBytes: number; durationMs?: number; width: number; height: number };

const lastConfigure = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.configureCalls.at(-1) ?? null);
const mediaCalls = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.mediaCalls ?? []);
const videoCalls = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.videoCalls ?? 0);
const activateCalls = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.activateCalls ?? 0);

/** Fichier que le sélecteur simulé renverra au prochain choix d'une vidéo (null : sélecteur fermé sans rien choisir). */
const nextVideo = (page: Page, media: Media | null) =>
  page.evaluate((m) => {
    if (window.__prismeLiveWeb) window.__prismeLiveWeb.nextMedia.video = m;
  }, media);

/** Refus du natif au prochain choix (fichier trop lourd, illisible…). */
const nextMediaError = (page: Page, message: string) =>
  page.evaluate((m) => {
    if (window.__prismeLiveWeb) window.__prismeLiveWeb.mediaError = m;
  }, message);

/** Active l'option « Fonds animés » et ouvre son écran. */
async function openLiveScreen(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: 'Fonds animés', exact: true }).click();
  await settings.getByRole('button', { name: /^Fonds animés/ }).click();
  const screen = page.locator('.overlay-screen');
  await expect(screen.getByRole('heading', { name: 'Fonds animés' })).toBeVisible();
  return screen;
}

const confirmMessage = (page: Page) => page.getByRole('status').filter({ hasText: 'Confirme dans l’écran Android' });
const updatedMessage = (page: Page) => page.getByRole('status').filter({ hasText: 'Fond animé mis à jour' });

test.describe('fonds animés : vidéo et GIF', () => {
  test('vidéo : choisie dans la galerie, puis activée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);

    // Les genres sont des puces ; la section de la vidéo attend un fichier.
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await expect(screen.getByRole('button', { name: 'Vidéo', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByText('Aucune vidéo choisie')).toBeVisible();
    await expect(screen.getByText(/en boucle, sans le son/)).toBeVisible();
    const activate = screen.getByRole('button', { name: 'Activer le fond animé' });
    await expect(activate).toBeDisabled();

    // Le natif copie le fichier dans l'app ; son nom, sa durée, son poids et sa taille s'affichent.
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await expect(screen.getByText('Vacances.mp4')).toBeVisible();
    await expect(screen.getByText('0:15 · 46,3 Mo · 1080 × 1920')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Changer de vidéo' })).toBeVisible();
    expect(await mediaCalls(page)).toEqual(['video']);

    // L'activation envoie le genre « vidéo » puis ouvre l'écran d'Android du fond vidéo.
    await expect(activate).toBeEnabled();
    await activate.click();
    await expect(confirmMessage(page)).toBeVisible();
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'video', eco: true, doubleTap: false });
    expect(await videoCalls(page)).toBe(1);
    expect(await activateCalls(page)).toBe(0);

    // Le fond vidéo est actif : l'état le dit, et le bouton passe à « Mettre à jour ».
    await expect(screen.getByText('Le fond vidéo Prisme est actif.')).toBeVisible();
    await screen.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(updatedMessage(page)).toBeVisible();
    expect(await videoCalls(page)).toBe(2);
  });

  test('vidéo figée en économie d’énergie : l’état le dit', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await page.evaluate(() => {
      if (window.__prismeLiveWeb) window.__prismeLiveWeb.paused = true;
    });
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(screen.getByText('Le fond vidéo Prisme est actif, figé pour économiser la batterie.')).toBeVisible();

    // Pause en économie de batterie coupée : le fond n'est plus figé.
    await screen.getByRole('switch', { name: 'Pause en économie de batterie' }).click();
    await expect.poll(async () => (await lastConfigure(page))?.eco).toBe(false);
  });

  test('GIF : choisi dans la galerie, puis activé par le fond des scènes', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);

    await screen.getByRole('button', { name: 'GIF', exact: true }).click();
    await expect(screen.getByText('Aucun GIF choisi')).toBeVisible();
    await expect(screen.getByText(/remplit l’écran/)).toBeVisible();
    const activate = screen.getByRole('button', { name: 'Activer le fond animé' });
    await expect(activate).toBeDisabled();

    await screen.getByRole('button', { name: 'Choisir un GIF' }).click();
    await expect(screen.getByText('Chat.gif')).toBeVisible();
    // Un GIF n'a pas de durée.
    await expect(screen.getByText('3,1 Mo · 480 × 480')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Changer de GIF' })).toBeVisible();
    expect(await mediaCalls(page)).toEqual(['gif']);

    await activate.click();
    await expect(confirmMessage(page)).toBeVisible();
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'gif' });
    // Le GIF passe par le service des scènes, pas par celui de la vidéo.
    expect(await activateCalls(page)).toBe(1);
    expect(await videoCalls(page)).toBe(0);
    await expect(screen.getByText('Le fond animé Prisme est actif.')).toBeVisible();

    await screen.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(updatedMessage(page)).toBeVisible();
  });

  test('activation impossible sans fichier choisi ou avec l’option coupée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);
    const activate = screen.getByRole('button', { name: 'Activer le fond animé' });

    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await expect(activate).toBeDisabled();
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await expect(activate).toBeEnabled();

    // Option coupée (interrupteur en haut de l'écran) : le fichier reste choisi, mais rien ne peut être activé.
    await screen.getByRole('switch', { name: 'Activer l\'option fonds animés' }).click();
    await expect(screen.getByText('Vacances.mp4')).toBeVisible();
    await expect(activate).toBeDisabled();
    await screen.getByRole('switch', { name: 'Activer l\'option fonds animés' }).click();
    await expect(activate).toBeEnabled();

    await screen.getByRole('button', { name: 'GIF', exact: true }).click();
    await expect(screen.getByRole('button', { name: 'Activer le fond animé' })).toBeDisabled();
    await screen.getByRole('button', { name: 'Choisir un GIF' }).click();
    await expect(screen.getByRole('button', { name: 'Activer le fond animé' })).toBeEnabled();
  });

  test('choix annulé ou refusé : rien ne change, la raison est affichée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await expect(screen.getByText('Aucune vidéo choisie')).toBeVisible();

    // Sélecteur fermé sans rien choisir.
    await nextVideo(page, null);
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await expect.poll(async () => (await mediaCalls(page)).length).toBe(1);
    await expect(screen.getByText('Aucune vidéo choisie')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Activer le fond animé' })).toBeDisabled();

    // Fichier refusé par le natif (trop lourd) : son message s'affiche, aucun fichier n'est retenu.
    await nextMediaError(page, 'Cette vidéo pèse 412 Mo : la limite est de 300 Mo.');
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cette vidéo pèse 412 Mo : la limite est de 300 Mo.' })).toBeVisible();
    await expect(screen.getByText('Aucune vidéo choisie')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Choisir une vidéo' })).toBeEnabled();
  });

  test('un fichier de remplacement prend la place du précédent', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await expect(screen.getByText('Vacances.mp4')).toBeVisible();

    await nextVideo(page, { name: 'Plage.webm', sizeBytes: 820 * 1024, durationMs: 3_723_000, width: 1920, height: 1080 });
    await screen.getByRole('button', { name: 'Changer de vidéo' }).click();
    await expect(screen.getByText('Plage.webm')).toBeVisible();
    await expect(screen.getByText('1:02:03 · 820 Ko · 1920 × 1080')).toBeVisible();
    await expect(screen.getByText('Vacances.mp4')).toBeHidden();
  });

  test('vidéo et scènes sont deux fonds Android : passer de l’un à l’autre rouvre l’écran du système', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);

    // Fond vidéo actif.
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(confirmMessage(page)).toBeVisible();
    await expect(screen.getByText('Le fond vidéo Prisme est actif.')).toBeVisible();

    // Le GIF a besoin du service des scènes : le fond vidéo actif ne compte pas, Android doit confirmer.
    await screen.getByRole('button', { name: 'GIF', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir un GIF' }).click();
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeHidden();
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(confirmMessage(page)).toBeVisible();
    expect(await activateCalls(page)).toBe(1);
    await expect(screen.getByText('Le fond animé Prisme est actif.')).toBeVisible();

    // Et inversement : les scènes actives, la vidéo doit être confirmée à son tour.
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await expect(screen.getByRole('button', { name: 'Activer le fond animé' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeHidden();
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(confirmMessage(page)).toBeVisible();
    expect(await videoCalls(page)).toBe(2);
  });

  test('avec le fond vidéo actif, la photo demande encore son propre fond', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);
    await screen.getByRole('button', { name: 'Vidéo', exact: true }).click();
    await screen.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(screen.getByText('Le fond vidéo Prisme est actif.')).toBeVisible();

    // « Changer à chaque déverrouillage » n'existe que dans le fond des scènes (photo).
    await screen.getByRole('button', { name: 'Photo', exact: true }).click();
    await expect(screen.getByText(/Active d’abord le fond animé Prisme/)).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Changer à chaque déverrouillage' })).toBeDisabled();
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeHidden();
  });
});
