import { type Locator, type Page, expect, test } from '@playwright/test';
import { activeQuotes, quoteOfTheDay } from '../../src/features/quote/model';
import { mockApis } from './mocks';

const topOverlay = (page: Page) => page.locator('.overlay-layer').last();
const quoteConfigs = (page: Page) => page.evaluate(() => window.__prismeQuoteWeb?.configs ?? []);
const lastConfig = async (page: Page) => (await quoteConfigs(page)).at(-1);
const snackbar = (page: Page, text: string | RegExp) => page.locator('.snackbar').filter({ hasText: text });
/** Laisse le temps à l'écran de relire l'état du natif (toutes les 3 s). */
const STATUS = { timeout: 10_000 };

/** Jour fixé : 2 octobre 2026, 6 h à Paris. La phrase du jour en découle, comme côté natif. */
const DAY = new Date('2026-10-02T06:00:00+02:00');
const proverbs = activeQuotes('proverbs', []);

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  return page.locator('.tab[data-active="true"]');
}

/** Active l'option dans Réglages › Options avancées puis ouvre son écran. */
async function openQuoteScreen(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Citation du jour', exact: true }).click();
  await settings.getByRole('button', { name: /Citation du jour/ }).click();
  const screen = topOverlay(page);
  await expect(screen.getByRole('heading', { name: 'Citation du jour' })).toBeVisible();
  return screen;
}

const todayText = (screen: Locator) => screen.getByRole('figure', { name: 'Phrase du jour' }).locator('blockquote');
const group = (screen: Locator, name: string) => screen.getByRole('group', { name });

/** Luminosité moyenne (0 à 1) d'une bande de l'aperçu, là où se pose la phrase (verrouillage, en bas). */
async function bandLuma(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.quote-preview__canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return -1;
    const x0 = Math.floor(canvas.width * 0.1);
    const y0 = Math.floor(canvas.height * 0.66);
    const { data } = ctx.getImageData(x0, y0, Math.floor(canvas.width * 0.8), Math.floor(canvas.height * 0.16));
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * (data[i] as number) + 0.7152 * (data[i + 1] as number) + 0.0722 * (data[i + 2] as number);
    return sum / (data.length / 4) / 255;
  });
}

test.describe('citation du jour', () => {
  test('option avancée désactivée par défaut, activée depuis les réglages', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const settings = await openSettings(page);
    const option = settings.getByRole('switch', { name: 'Citation du jour', exact: true });
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute('aria-checked', 'false');
    await expect(settings.getByText('Une phrase sur ton fond d’écran, renouvelée chaque matin')).toBeVisible();

    // Au lancement le natif apprend que l'option est coupée, avec les réglages par défaut (verrouillage, proverbes).
    await expect
      .poll(() => lastConfig(page))
      .toEqual({ enabled: false, target: 'lock', font: 'serif', position: 'bottom', size: 'medium', color: 'auto', shift: 0, quotes: [] });

    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await lastConfig(page))?.enabled).toBe(true);
    const on = await lastConfig(page);
    // Une centaine de proverbes, sans auteur : la liste active est envoyée au natif.
    expect(on?.quotes).toEqual(proverbs);
    expect(proverbs.length).toBeGreaterThanOrEqual(80);
    expect(proverbs.length).toBeLessThanOrEqual(120);

    await option.click();
    await expect.poll(async () => (await lastConfig(page))?.enabled).toBe(false);
    expect((await lastConfig(page))?.quotes).toEqual([]);
  });

  test('phrase du jour identique au natif, « Une autre » avance d’un cran', async ({ page }) => {
    await mockApis(page);
    await page.clock.setFixedTime(DAY);
    await page.goto('/');
    const screen = await openQuoteScreen(page);

    await expect(todayText(screen)).toHaveText(quoteOfTheDay(proverbs, DAY, 0)?.text ?? '');
    await expect.poll(() => lastConfig(page)).toMatchObject({ enabled: true, shift: 0 });
    // L'aperçu est dessiné au format de l'écran de verrouillage, avec ses repères.
    await expect(screen.getByRole('img', { name: /Aperçu de la phrase sur l’écran de verrouillage/ })).toBeVisible();
    await expect(screen.locator('.quote-preview[data-screen="lock"]')).toBeVisible();

    await screen.getByRole('button', { name: 'Une autre' }).click();
    await expect(todayText(screen)).toHaveText(quoteOfTheDay(proverbs, DAY, 1)?.text ?? '');
    await expect.poll(async () => (await lastConfig(page))?.shift).toBe(1);
    await screen.getByRole('button', { name: 'Une autre' }).click();
    await expect(todayText(screen)).toHaveText(quoteOfTheDay(proverbs, DAY, 2)?.text ?? '');
    await expect.poll(async () => (await lastConfig(page))?.shift).toBe(2);
    // Aucune des trois phrases vues n'est la même.
    const seen = new Set([0, 1, 2].map((shift) => quoteOfTheDay(proverbs, DAY, shift)?.text));
    expect(seen.size).toBe(3);

    // Le cran est gardé au redémarrage : même phrase, et le natif la reçoit de nouveau.
    await page.reload();
    await expect.poll(async () => (await lastConfig(page))?.shift).toBe(2);
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Citation du jour/ }).click();
    await expect(todayText(topOverlay(page))).toHaveText(quoteOfTheDay(proverbs, DAY, 2)?.text ?? '');
  });

  test('aperçu fidèle : le texte est dessiné, clair ou sombre selon le fond', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openQuoteScreen(page);
    const background = (name: string) => group(screen, 'Fond de l’aperçu').getByRole('button', { name });
    const color = (name: string) => group(screen, 'Couleur').getByRole('button', { name });
    const lumaWith = async (choice: string) => {
      await color(choice).click();
      await expect(color(choice)).toHaveAttribute('aria-pressed', 'true');
      return bandLuma(page);
    };

    // Fond de nuit : en automatique le texte est clair, comme en « Blanc » et à l'opposé de « Noir ».
    await background('Nuit').click();
    const [nightAuto, nightWhite, nightBlack] = [await lumaWith('Auto'), await lumaWith('Blanc'), await lumaWith('Noir')];
    expect(nightAuto).toBeGreaterThanOrEqual(0);
    expect(Math.abs(nightAuto - nightWhite)).toBeLessThan(0.02);
    expect(Math.abs(nightAuto - nightBlack)).toBeGreaterThan(0.15);

    // Fond de plein jour : en automatique le texte est sombre.
    await background('Jour').click();
    const [dayAuto, dayWhite, dayBlack] = [await lumaWith('Auto'), await lumaWith('Blanc'), await lumaWith('Noir')];
    expect(Math.abs(dayAuto - dayBlack)).toBeLessThan(0.02);
    expect(Math.abs(dayAuto - dayWhite)).toBeGreaterThan(0.15);
  });

  test('écran, source, police, position, taille et couleur envoyés au natif, gardés au redémarrage', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openQuoteScreen(page);
    await expect.poll(() => lastConfig(page)).toMatchObject({ enabled: true, target: 'lock', font: 'serif', position: 'bottom', size: 'medium', color: 'auto' });

    // Par défaut : verrouillage, proverbes.
    await expect(screen.getByRole('button', { name: 'Verrouillage' })).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByRole('radio', { name: 'Proverbes' })).toHaveAttribute('aria-checked', 'true');
    await expect(screen.getByRole('radio', { name: 'Aperçu sur' })).toHaveCount(0);

    await screen.getByRole('button', { name: 'Les deux' }).click();
    await expect.poll(async () => (await lastConfig(page))?.target).toBe('both');
    // Deux écrans visés : on choisit celui que l'aperçu montre.
    await expect(screen.getByRole('radiogroup', { name: 'Aperçu sur' })).toBeVisible();
    await screen.getByRole('radio', { name: 'Accueil' }).click();
    await expect(screen.locator('.quote-preview[data-screen="home"]')).toBeVisible();
    await expect(screen.getByRole('img', { name: /Aperçu de la phrase sur l’écran d’accueil/ })).toBeVisible();
    await screen.getByRole('button', { name: 'Accueil', exact: true }).click();
    await expect.poll(async () => (await lastConfig(page))?.target).toBe('home');
    await expect(screen.getByRole('radiogroup', { name: 'Aperçu sur' })).toHaveCount(0);
    await expect(screen.locator('.quote-preview[data-screen="home"]')).toBeVisible();

    await group(screen, 'Police').getByRole('button', { name: 'Sans-serif' }).click();
    await group(screen, 'Position').getByRole('button', { name: 'Haut' }).click();
    await group(screen, 'Taille').getByRole('button', { name: 'Grande' }).click();
    await group(screen, 'Couleur').getByRole('button', { name: 'Blanc' }).click();
    await expect.poll(() => lastConfig(page)).toMatchObject({ target: 'home', font: 'sans', position: 'top', size: 'large', color: 'white' });

    // Rechargement de l'app : les choix reviennent, et le natif les reçoit de nouveau au lancement.
    await page.reload();
    await expect.poll(() => lastConfig(page)).toMatchObject({ enabled: true, target: 'home', font: 'sans', position: 'top', size: 'large', color: 'white' });
    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Citation du jour/ }).click();
    const again = topOverlay(page);
    await expect(group(again, 'Police').getByRole('button', { name: 'Sans-serif' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group(again, 'Position').getByRole('button', { name: 'Haut' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group(again, 'Taille').getByRole('button', { name: 'Grande' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group(again, 'Couleur').getByRole('button', { name: 'Blanc' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('l’écran dit si la phrase peut se poser : fond posé par Prisme, fond animé, option coupée', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openQuoteScreen(page);
    const status = screen.getByRole('status');

    // Aucun fond posé par Prisme : rien n'est modifié, et l'écran l'explique.
    await expect(status).toContainText('Pose d’abord un fond depuis Prisme', STATUS);
    await expect(status).toContainText('Un fond posé autrement n’est pas modifié');

    // Le fond de verrouillage est posé par Prisme : prêt pour l'écran visé (le verrouillage).
    await page.evaluate(() => {
      if (window.__prismeQuoteWeb) window.__prismeQuoteWeb.status = { home: false, lock: true, homeLive: false, lockLive: false };
    });
    await expect(status).toContainText('Prêt : nouvelle phrase chaque matin vers 6 h', STATUS);

    // Les deux écrans visés, un seul fond posé par Prisme.
    await screen.getByRole('button', { name: 'Les deux' }).click();
    await expect(status).toContainText('Un des deux écrans ne peut pas la recevoir pour l’instant', STATUS);
    await page.evaluate(() => {
      if (window.__prismeQuoteWeb) window.__prismeQuoteWeb.status = { home: true, lock: true, homeLive: false, lockLive: false };
    });
    await expect(status).toContainText('Prêt : nouvelle phrase chaque matin vers 6 h', STATUS);

    // Un fond animé occupe les deux écrans.
    await page.evaluate(() => {
      if (window.__prismeQuoteWeb) window.__prismeQuoteWeb.status = { home: true, lock: true, homeLive: true, lockLive: true };
    });
    await expect(status).toContainText('Un fond animé est actif : la phrase n’y est pas ajoutée', STATUS);

    // Accueil animé mais verrouillage avec son image fixe : la phrase se pose au verrouillage.
    await screen.getByRole('button', { name: 'Verrouillage' }).click();
    await page.evaluate(() => {
      if (window.__prismeQuoteWeb) window.__prismeQuoteWeb.status = { home: true, lock: true, homeLive: true, lockLive: false };
    });
    await expect(status).toContainText('Prêt : nouvelle phrase chaque matin vers 6 h', STATUS);

    // Option coupée depuis l'interrupteur de l'écran : annoncée, et transmise au natif.
    await screen.getByRole('switch', { name: 'Activer la citation du jour' }).click();
    await expect(status).toContainText('Option désactivée', STATUS);
    await expect.poll(async () => (await lastConfig(page))?.enabled).toBe(false);
  });

  test('Mes citations : ajout, modification, suppression avec annulation, source', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openQuoteScreen(page);
    const list = screen.getByRole('list');
    await expect(screen.getByRole('heading', { name: 'Mes citations', exact: true })).toBeVisible();
    await expect(list).toHaveCount(0);

    // Ajout : texte et auteur facultatif.
    await screen.getByRole('button', { name: 'Ajouter une citation' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nouvelle citation' });
    await expect(sheet.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await sheet.getByLabel('Citation', { exact: true }).fill('  Chaque jour   est un cadeau.  ');
    await sheet.getByLabel('Auteur (facultatif)').fill('Maman');
    await sheet.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(snackbar(page, 'Citation ajoutée')).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Mes citations (1)' })).toBeVisible();
    await expect(list.getByText('Chaque jour est un cadeau.')).toBeVisible();
    await expect(list.getByText('— Maman')).toBeVisible();

    // Sans citation choisie dans la source, les proverbes restent la liste active.
    await expect.poll(async () => (await lastConfig(page))?.quotes.length).toBe(proverbs.length);

    // Source « Mes citations » : seule la phrase perso est en lice, avec son auteur.
    await screen.getByRole('radio', { name: 'Mes citations' }).click();
    await expect.poll(async () => (await lastConfig(page))?.quotes).toEqual([{ text: 'Chaque jour est un cadeau.', author: 'Maman' }]);
    await expect(todayText(screen)).toHaveText('Chaque jour est un cadeau.');
    await expect(screen.getByRole('figure', { name: 'Phrase du jour' }).locator('figcaption')).toHaveText('— Maman');

    // « Les deux » : proverbes puis citation perso.
    await screen.getByRole('radio', { name: 'Les deux' }).click();
    await expect.poll(async () => (await lastConfig(page))?.quotes.length).toBe(proverbs.length + 1);
    await expect.poll(async () => (await lastConfig(page))?.quotes.at(-1)).toEqual({ text: 'Chaque jour est un cadeau.', author: 'Maman' });
    await screen.getByRole('radio', { name: 'Mes citations' }).click();

    // Modification.
    await screen.getByRole('button', { name: /^Modifier la citation « Chaque jour est un cadeau/ }).click();
    const editor = page.getByRole('dialog', { name: 'Modifier la citation' });
    await expect(editor.getByLabel('Citation', { exact: true })).toHaveValue('Chaque jour est un cadeau.');
    await expect(editor.getByLabel('Auteur (facultatif)')).toHaveValue('Maman');
    await editor.getByLabel('Citation', { exact: true }).fill('Chaque matin est un cadeau.');
    await editor.getByLabel('Auteur (facultatif)').fill('');
    await editor.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(snackbar(page, 'Citation modifiée')).toBeVisible();
    await expect(list.getByText('Chaque matin est un cadeau.')).toBeVisible();
    await expect(list.getByText('— Maman')).toHaveCount(0);
    await expect.poll(async () => (await lastConfig(page))?.quotes).toEqual([{ text: 'Chaque matin est un cadeau.' }]);

    // Suppression, puis annulation.
    await screen.getByRole('button', { name: /^Supprimer la citation « Chaque matin est un cadeau/ }).click();
    await expect(list).toHaveCount(0);
    await expect(screen.getByText('Aucune citation perso pour l’instant : les proverbes sont utilisés.')).toBeVisible();
    // Source « Mes citations » sans citation : les proverbes prennent le relais.
    await expect.poll(async () => (await lastConfig(page))?.quotes.length).toBe(proverbs.length);
    await snackbar(page, 'Citation supprimée').getByRole('button', { name: 'Annuler' }).click();
    await expect(list.getByText('Chaque matin est un cadeau.')).toBeVisible();
    await expect.poll(async () => (await lastConfig(page))?.quotes).toEqual([{ text: 'Chaque matin est un cadeau.' }]);

    // Les citations perso sont gardées au redémarrage.
    await page.reload();
    await expect.poll(async () => (await lastConfig(page))?.quotes).toEqual([{ text: 'Chaque matin est un cadeau.' }]);
  });

  test('sauvegarde : les citations perso et leurs réglages voyagent, la restauration fusionne', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openQuoteScreen(page);
    await group(screen, 'Police').getByRole('button', { name: 'Sans-serif' }).click();
    await screen.getByRole('button', { name: 'Ajouter une citation' }).click();
    await page.getByLabel('Citation', { exact: true }).fill('Un jour à la fois.');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.keyboard.press('Escape');

    const settings = await openSettings(page);
    await settings.getByRole('button', { name: /Exporter une sauvegarde/ }).click();
    await expect(snackbar(page, /Sauvegarde enregistrée/)).toBeVisible();
    const exported = await page.evaluate(() => window.__prismeSystemWeb?.exports[0]);
    const backup = JSON.parse(exported?.data ?? '{}');
    expect(backup.quotes).toMatchObject({ target: 'lock', source: 'proverbs', font: 'sans', custom: [{ text: 'Un jour à la fois.' }] });
    expect(backup.quotes.shift).toBeUndefined();
    expect(backup.settings.features.quote).toBe(true);

    // Restauration d'une autre sauvegarde : une citation de plus, la même n'est pas dupliquée.
    const other = { ...backup, quotes: { ...backup.quotes, source: 'both', custom: [...backup.quotes.custom, { id: 'q-autre', text: 'Rira bien qui rira le dernier.', author: 'Moi' }] } };
    await page.evaluate((data) => {
      if (window.__prismeSystemWeb) window.__prismeSystemWeb.nextImport = data;
    }, JSON.stringify(other));
    await settings.getByRole('button', { name: /Restaurer une sauvegarde/ }).click();
    await expect(snackbar(page, /Sauvegarde restaurée/)).toBeVisible();
    await settings.getByRole('button', { name: /Citation du jour/ }).click();
    const again = topOverlay(page);
    await expect(again.getByRole('heading', { name: 'Mes citations (2)' })).toBeVisible();
    await expect(again.getByRole('radio', { name: 'Les deux' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await lastConfig(page))?.quotes.length).toBe(proverbs.length + 2);
  });
});
