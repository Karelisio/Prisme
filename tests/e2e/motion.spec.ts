import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const lastConfigure = (page: Page) => page.evaluate(() => window.__prismeLiveWeb?.configureCalls.at(-1) ?? null);
const lastSettings = async (page: Page) => (await lastConfigure(page))?.settings;

async function openLiveScreen(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.locator('.tab[data-active="true"]');
  await settings.getByRole('switch', { name: 'Fonds animés', exact: true }).click();
  await settings.getByRole('button', { name: /^Fonds animés/ }).click();
  return page.locator('.overlay-screen');
}

async function chooseMode(page: Page, label: string) {
  const screen = await openLiveScreen(page);
  await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'image' });
  await screen.getByRole('group', { name: 'Genre de fond animé' }).getByRole('button', { name: label }).click();
  return screen;
}

test.describe('fonds animés : dégradé, particules, météo animée', () => {
  test('dégradé : palette, vitesse et grain envoyés au natif, puis activation', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await chooseMode(page, 'Dégradé');
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'gradient', eco: true, doubleTap: false, settings: {} });

    // Palette Aurore par défaut ; une tuile d'aperçu par palette, Material You en premier.
    const palettes = screen.getByRole('group', { name: 'Palette du dégradé' }).getByRole('button');
    await expect(palettes).toHaveCount(7);
    await expect(palettes.first()).toHaveAccessibleName('Palette Material You');
    await expect(screen.getByRole('button', { name: 'Palette Aurore' })).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByRole('radio', { name: 'Lente' })).toHaveAttribute('aria-checked', 'true');

    await screen.getByRole('button', { name: 'Palette Océan' }).click();
    await screen.getByRole('radio', { name: 'Rapide' }).click();
    await screen.getByRole('switch', { name: 'Grain léger' }).click();
    await expect(screen.getByRole('button', { name: 'Palette Océan' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => lastSettings(page)).toEqual({ palette: 'ocean', speed: 'fast', grain: false });

    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect(page.locator('.snackbar').filter({ hasText: 'Confirme dans l’écran Android pour activer le fond animé' })).toBeVisible();
    expect(await page.evaluate(() => window.__prismeLiveWeb?.activated)).toBe(true);
    expect(await lastConfigure(page)).toMatchObject({ mode: 'gradient', settings: { palette: 'ocean', speed: 'fast', grain: false } });
    await expect(screen.getByText('Le fond animé Prisme est actif.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeVisible();
  });

  test('particules : style, densité, toucher et fond envoyés au natif, puis activation', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await chooseMode(page, 'Particules');
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'particles', settings: {} });

    const styles = screen.getByRole('group', { name: 'Style de particules' });
    await expect(styles.getByRole('button', { name: 'Lucioles' })).toHaveAttribute('aria-pressed', 'true');
    await styles.getByRole('button', { name: 'Bulles' }).click();
    await screen.getByRole('slider', { name: 'Densité des particules' }).fill('0.8');
    await screen.getByRole('radio', { name: 'Attirer' }).click();

    // Fond dégradé par défaut, avec ses palettes ; puis une couleur unie.
    await expect(screen.getByRole('group', { name: 'Palette du fond' })).toBeVisible();
    await screen.getByRole('radio', { name: 'Couleur' }).click();
    await expect(screen.getByRole('group', { name: 'Palette du fond' })).toHaveCount(0);
    await screen.getByRole('group', { name: 'Couleur du fond' }).getByRole('button', { name: 'Prune' }).click();
    await expect.poll(() => lastSettings(page)).toEqual({ style: 'bubbles', density: 0.8, touch: 'attract', background: 'color', color: '#1e1027' });

    // Fond photo sans image choisie dans le genre Photo : le dégradé en attendant.
    await screen.getByRole('radio', { name: 'Photo' }).click();
    await expect(screen.getByText('Choisis d’abord une image dans le genre Photo ; en attendant, le dégradé est affiché.')).toBeVisible();

    await screen.getByRole('button', { name: 'Activer le fond animé' }).click();
    await expect.poll(() => page.evaluate(() => window.__prismeLiveWeb?.activated)).toBe(true);
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'particles', settings: { style: 'bubbles', background: 'photo' } });
    await expect(screen.getByText('Le fond animé Prisme est actif.')).toBeVisible();
  });

  test('météo animée : lieu, état du dernier relevé et aperçu envoyés au natif', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    const screen = await openLiveScreen(page);

    // Genre Photo : la météo animée se règle sous la liste d'images.
    const toggle = screen.getByRole('switch', { name: 'Météo animée' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect.poll(() => lastConfigure(page)).toMatchObject({ mode: 'image', settings: { weather: { enabled: true, preview: 'auto' } } });
    await expect(screen.getByText('Choisis un lieu pour suivre sa météo.')).toBeVisible();

    // Lieu choisi par la recherche de ville (Open-Meteo simulé).
    await screen.getByLabel('Ville').fill('Lyon');
    await screen.getByRole('button', { name: 'Rechercher' }).click();
    await screen.getByRole('button', { name: 'Lyon, Auvergne-Rhône-Alpes, France' }).click();
    await expect.poll(() => lastSettings(page)).toEqual({
      weather: { enabled: true, preview: 'auto', latitude: 45.76, longitude: 4.84, name: 'Lyon, Auvergne-Rhône-Alpes, France' },
    });
    await expect(screen.getByText('Météo de Lyon : relevée dès que le fond animé est visible.')).toBeVisible();

    // Relevé fait par le natif quand le fond est visible (simulé), lu au prochain état.
    await page.evaluate(() => {
      const at = new Date();
      at.setHours(14, 5, 0, 0);
      const web = window.__prismeLiveWeb;
      if (web) web.weather = { code: 61, isDay: true, precipitation: 0.4, wind: 12, latitude: 45.76, longitude: 4.84, updatedAt: at.getTime() };
    });
    await expect(screen.getByText('Pluie à Lyon, mise à jour à 14:05')).toBeVisible({ timeout: 10_000 });

    // Aperçu : l'effet choisi s'affiche tout de suite, puis retour à la météo réelle.
    const previews = screen.getByRole('group', { name: 'Aperçu de la météo animée' });
    await expect(previews.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    await previews.getByRole('button', { name: 'Neige' }).click();
    await expect.poll(() => lastSettings(page)).toMatchObject({ weather: { enabled: true, preview: 'snow', latitude: 45.76, longitude: 4.84 } });
    await expect(screen.getByText('Aperçu : Neige. Choisis « Auto » pour suivre la météo réelle.')).toBeVisible();
    await previews.getByRole('button', { name: 'Orage' }).click();
    await expect.poll(async () => ((await lastSettings(page)) as { weather?: { preview?: string } } | undefined)?.weather?.preview).toBe('storm');
    await previews.getByRole('button', { name: 'Auto' }).click();
    await expect(screen.getByText('Pluie à Lyon, mise à jour à 14:05')).toBeVisible();

    // Coupée : plus rien par-dessus la photo, le lieu reste choisi.
    await toggle.click();
    await expect.poll(() => lastSettings(page)).toMatchObject({ weather: { enabled: false, preview: 'auto', latitude: 45.76 } });
    await expect(screen.getByRole('group', { name: 'Aperçu de la météo animée' })).toHaveCount(0);
  });
});
