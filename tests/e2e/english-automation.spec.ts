import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { PROVERBS } from '../../src/features/quote/proverbs';
import { mockApis } from './mocks';

// Les écrans des automatismes, des fonds animés, de la musique, du générateur et de la citation, avec l'interface en anglais.
// L'app démarre en français (le navigateur de test est en fr-FR) : la langue se change dans Réglages, comme un utilisateur.

/**
 * Ordre des options dans Réglages › Options avancées (celui de OPTIONS, dans AdvancedOptions.tsx) : une fois l'app en
 * anglais, on retrouve une option par son rang plutôt que par son libellé, qui dépend de la langue.
 */
const OPTION_ORDER = [...readFileSync(fileURLToPath(new URL('../../src/features/settings/AdvancedOptions.tsx', import.meta.url)), 'utf8').matchAll(/\{ key: '(\w+)',/g)].map(
  (match) => match[1],
);

type Option = 'dynamic' | 'live' | 'rotation' | 'music' | 'places' | 'generator' | 'focus' | 'events' | 'dim' | 'quote';

const automationConfig = (page: Page) => page.evaluate(() => window.__prismeAutomationWeb?.config ?? null);
const snackbar = (page: Page, text: string) => page.locator('.snackbar').filter({ hasText: text });

/** Réglages › English : toute l'interface passe en anglais. */
async function switchToEnglish(page: Page) {
  await mockApis(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

/** Active l'option (si besoin) puis ouvre son écran, depuis Réglages. */
async function openOption(page: Page, option: Option): Promise<Locator> {
  const index = OPTION_ORDER.indexOf(option);
  expect(index, `option « ${option} » introuvable dans AdvancedOptions.tsx`).toBeGreaterThanOrEqual(0);
  const row = page.locator('.tab[data-active="true"] .option-row').nth(index);
  const toggle = row.getByRole('switch');
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await row.locator('.option-row__main').click();
  return option === 'generator' ? page.getByRole('dialog', { name: 'Generator' }) : page.locator('.overlay-screen').last();
}

const back = (screen: Locator) => screen.getByRole('button', { name: 'Back', exact: true });

test.describe('interface en anglais : automatismes, fonds animés, générateur, citation', () => {
  test('Réglages › English : la langue change et l’option s’ouvre en anglais', async ({ page }) => {
    await switchToEnglish(page);
    await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const screen = await openOption(page, 'rotation');
    await expect(screen.getByRole('heading', { name: 'Rotation', exact: true })).toBeVisible();
    await expect(back(screen)).toBeVisible();
    await back(screen).click();
    await expect(screen).toHaveCount(0);
  });

  test('rotation', async ({ page }) => {
    await switchToEnglish(page);
    const screen = await openOption(page, 'rotation');
    await expect(screen.getByText(/^Prisme changes your wallpaper at regular intervals, even when the app is closed/)).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Enable rotation' })).toHaveAttribute('aria-checked', 'true');

    // Source par défaut : fonds pris au hasard en ligne (sources actives grâce aux clés factices des tests).
    await expect(screen.getByRole('heading', { name: 'Source', exact: true })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Online, random' })).toHaveAttribute('aria-pressed', 'true');
    await expect(screen.getByRole('button', { name: 'Favorites (0)' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Phone folder…' })).toBeVisible();
    await expect(screen.getByRole('status').filter({ hasText: 'Random online wallpapers: Wallpapers' })).toBeVisible();

    // Thème en ligne, mot-clé.
    const themes = screen.getByLabel('Online rotation theme');
    for (const name of ['Wallpapers', 'For you', 'Abstract', 'Dark', 'Space', 'Cities', 'Mountains', 'Flowers', 'Animals', 'Gradients', 'Video games', 'Keyword…']) {
      await expect(themes.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await themes.getByRole('button', { name: 'Keyword…', exact: true }).click();
    await expect(screen.getByRole('status').filter({ hasText: 'Enter a keyword for online rotation.' })).toBeVisible();
    await screen.getByLabel('Keyword', { exact: true }).fill('aurora');
    await screen.getByLabel('Keyword', { exact: true }).press('Enter');
    await expect(screen.getByRole('status').filter({ hasText: 'Random online wallpapers: “aurora”' })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Wi-Fi only' })).toBeVisible();
    await expect(screen.getByText('On mobile data, the current wallpaper stays in place')).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Smart rotation' })).toBeVisible();

    // Source « Favoris » : il faut deux fonds, l'ordre aléatoire apparaît.
    await screen.getByRole('button', { name: 'Favorites (0)' }).click();
    await expect(screen.getByRole('status').filter({ hasText: 'The chosen source needs at least two wallpapers.' })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Wi-Fi only' })).toHaveCount(0);
    await expect(screen.getByRole('switch', { name: 'Shuffle' })).toBeVisible();
    await expect(screen.getByText('Otherwise, in the source’s order')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Change now' })).toBeDisabled();

    // Intervalle et écran visé : les mêmes valeurs qu'en français arrivent au natif.
    await expect(screen.getByRole('heading', { name: 'Change every' })).toBeVisible();
    await screen.getByRole('button', { name: '3 h', exact: true }).click();
    const target = screen.getByLabel('Target screen');
    for (const name of ['Home', 'Lock', 'Both']) await expect(target.getByRole('button', { name, exact: true })).toBeVisible();
    await target.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect.poll(async () => (await automationConfig(page))?.rotation).toMatchObject({ enabled: true, intervalMinutes: 180, target: 'lock' });
  });

  test('fonds animés : genres, réglages, activation', async ({ page }) => {
    await switchToEnglish(page);
    const screen = await openOption(page, 'live');
    await expect(screen.getByRole('heading', { name: 'Live wallpapers', exact: true })).toBeVisible();
    await expect(screen.getByText(/^A wallpaper that moves on your home screen\./)).toBeVisible();

    const types = screen.getByRole('group', { name: 'Live wallpaper type' });
    for (const name of ['Photo', 'Video', 'GIF', 'Gradient', 'Particles', '3D depth']) await expect(types.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Double-tap on the home screen' })).toBeVisible();
    await expect(screen.getByText('Next image in the list (Photo), or a new variation depending on the type')).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Pause in battery saver' })).toBeVisible();

    // Photo : choix d'une image dans la feuille, déverrouillage et météo animée.
    await expect(screen.getByRole('button', { name: 'Choose an image' })).toBeVisible();
    await expect(screen.getByText('The image shifts slightly when you tilt your phone, as if it were behind the screen.')).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Parallax intensity' })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Change on every unlock' })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Animated weather' })).toBeVisible();
    await screen.getByRole('button', { name: 'Choose an image' }).click();
    const sheet = page.getByRole('dialog', { name: 'Live wallpaper image' });
    await expect(sheet.getByText('Nothing here yet')).toBeVisible();
    await expect(sheet.getByText('Add wallpapers to your favorites or a collection, or import an image.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Import' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Dégradé : palettes, vitesse, grain, puis activation (message d'Android).
    await types.getByRole('button', { name: 'Gradient', exact: true }).click();
    await expect(screen.getByText(/^Colors that slowly ripple, like the northern lights\./)).toBeVisible();
    const palettes = screen.getByRole('group', { name: 'Gradient palette' });
    for (const name of ['Material You palette', 'Aurora palette', 'Sunset palette', 'Ocean palette', 'Forest palette', 'Neon palette', 'Pastel palette']) {
      await expect(palettes.getByRole('button', { name })).toBeVisible();
    }
    const speed = screen.getByRole('radiogroup', { name: 'Gradient speed' });
    for (const name of ['Slow', 'Medium', 'Fast']) await expect(speed.getByRole('radio', { name })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Light grain' })).toBeVisible();
    await screen.getByRole('button', { name: 'Activate live wallpaper' }).click();
    await expect(snackbar(page, 'Confirm on the Android screen to activate the live wallpaper')).toBeVisible();

    // Particules.
    await types.getByRole('button', { name: 'Particles', exact: true }).click();
    const styles = screen.getByRole('group', { name: 'Particle style' });
    for (const name of ['Fireflies', 'Bubbles', 'Stars', 'Soft snow']) await expect(styles.getByRole('button', { name })).toBeVisible();
    await expect(screen.getByLabel('Particle density')).toBeVisible();
    await expect(screen.getByRole('radiogroup', { name: 'Touch effect' }).getByRole('radio', { name: 'Repel' })).toBeVisible();
    await screen.getByRole('radiogroup', { name: 'Particle background' }).getByRole('radio', { name: 'Color' }).click();
    const colors = screen.getByRole('group', { name: 'Background color' });
    for (const name of ['Night', 'Slate', 'Plum', 'Fir', 'Black']) await expect(colors.getByRole('button', { name })).toBeVisible();

    // Vidéo et GIF : état du fichier et limites de poids.
    await types.getByRole('button', { name: 'Video', exact: true }).click();
    await expect(screen.getByText('No video chosen')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Choose a video' })).toBeVisible();
    await expect(screen.getByText(/It’s copied into the app \(300 MB max\)/)).toBeVisible();
    await types.getByRole('button', { name: 'GIF', exact: true }).click();
    await expect(screen.getByText('No GIF chosen')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Choose a GIF' })).toBeVisible();
    await expect(screen.getByText(/It’s copied into the app \(50 MB max\)/)).toBeVisible();

    // Relief 3D.
    await types.getByRole('button', { name: '3D depth', exact: true }).click();
    await expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeVisible();
    await expect(screen.getByText('Choose a photo with a sharp subject in the foreground: a person, an animal, an object.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Prepare depth effect' })).toBeDisabled();
    await expect(screen.getByLabel('Depth', { exact: true })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Shadow under the subject' })).toBeVisible();
  });

  test('générateur : styles, réglages, enregistrement', async ({ page }) => {
    await switchToEnglish(page);
    const generator = await openOption(page, 'generator');
    await expect(generator.getByRole('heading', { name: 'Create a wallpaper' })).toBeVisible();
    await expect(generator.getByRole('switch', { name: 'Enable the generator' })).toHaveAttribute('aria-checked', 'true');
    await expect(generator.getByLabel('Creation preview')).toBeVisible();

    const gradients = generator.getByRole('group', { name: 'Gradients' });
    const patterns = generator.getByRole('group', { name: 'Patterns' });
    for (const name of ['Solid', 'Gradient', 'Radial', 'Aurora', 'Organic']) await expect(gradients.getByRole('button', { name, exact: true })).toBeVisible();
    for (const name of ['Geometric', 'Dots', 'Waves', 'Bauhaus', 'Stripes', 'Terrazzo', 'Isometric grid', 'Shapes', 'Dunes']) {
      await expect(patterns.getByRole('button', { name, exact: true })).toBeAttached();
    }
    const slider = (name: string) => generator.getByLabel(name, { exact: true });

    // Style de départ (aurore) : seulement le grain ; chaque style apporte ses réglages.
    await expect(slider('Grain')).toBeVisible();
    await gradients.getByRole('button', { name: 'Gradient', exact: true }).click();
    await expect(slider('Angle')).toBeVisible();
    await gradients.getByRole('button', { name: 'Organic', exact: true }).click();
    await expect(slider('Softness')).toBeVisible();
    await expect(generator.getByRole('radiogroup', { name: 'Number of points' }).getByRole('radio', { name: '5' })).toBeVisible();
    await patterns.getByRole('button', { name: 'Geometric', exact: true }).click();
    const shapes = generator.getByRole('radiogroup', { name: 'Tile shape' });
    for (const name of ['Triangles', 'Hexagons', 'Diamonds']) await expect(shapes.getByRole('radio', { name })).toBeVisible();
    for (const name of ['Scale', 'Spacing', 'Rotation']) await expect(slider(name)).toBeVisible();
    await patterns.getByRole('button', { name: 'Dots', exact: true }).click();
    await expect(slider('Size')).toBeVisible();
    await patterns.getByRole('button', { name: 'Stripes', exact: true }).click();
    await expect(slider('Thickness')).toBeVisible();
    await patterns.getByRole('button', { name: 'Terrazzo', exact: true }).click();
    await expect(slider('Density')).toBeVisible();

    // Palettes, couleurs et actions.
    await expect(generator.getByLabel('Palettes')).toBeVisible();
    await expect(generator.getByLabel('Color 1')).toBeVisible();
    for (const name of ['Randomize', 'Vary', 'Apply']) await expect(generator.getByRole('button', { name, exact: true })).toBeVisible();

    // Enregistrement : la collection « Créations » reçoit la création.
    await generator.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(snackbar(page, 'Saved to the “Creations” collection')).toBeVisible();
    await expect(snackbar(page, 'Saved to the “Creations” collection').getByRole('button', { name: 'View' })).toBeVisible();
  });

  test('citation du jour : réglages, aperçu, mes citations', async ({ page }) => {
    await switchToEnglish(page);
    const screen = await openOption(page, 'quote');
    await expect(screen.getByRole('heading', { name: 'Quote of the day', exact: true })).toBeVisible();
    await expect(screen.getByText(/^A phrase placed on your wallpaper, refreshed every morning around 6 am/)).toBeVisible();
    // Rien n'a été posé depuis Prisme : l'écran le dit (état relu du natif).
    await expect(screen.getByRole('status').filter({ hasText: 'First set a wallpaper from Prisme (preview, then Apply)' })).toBeVisible({ timeout: 10_000 });

    // Les proverbes sont du contenu : ils restent en français, et l'écran le précise.
    const today = screen.getByRole('figure', { name: 'Today’s quote' }).locator('blockquote');
    await expect(today).toBeVisible();
    expect(PROVERBS).toContain(await today.innerText());
    await expect(screen.getByText('Proverbs are in French.')).toBeVisible();
    await expect(screen.getByRole('img', { name: 'Preview of the quote on the lock screen' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Another quote', exact: true })).toBeVisible();

    // Écran visé « les deux » : l'aperçu se choisit entre verrouillage et accueil.
    await screen.getByLabel('Target screen').getByRole('button', { name: 'Both', exact: true }).click();
    const preview = screen.getByRole('radiogroup', { name: 'Preview on' });
    await expect(preview.getByRole('radio', { name: 'Lock' })).toBeVisible();
    await preview.getByRole('radio', { name: 'Home' }).click();
    await expect(screen.getByRole('img', { name: 'Preview of the quote on the home screen' })).toBeVisible();
    const backgrounds = screen.getByRole('group', { name: 'Preview background' });
    for (const name of ['Night', 'Dawn', 'Day']) await expect(backgrounds.getByRole('button', { name })).toBeVisible();

    // Source, police, position, taille, couleur.
    const source = screen.getByRole('radiogroup', { name: 'Source' });
    for (const name of ['Proverbs', 'My quotes', 'Both']) await expect(source.getByRole('radio', { name })).toBeVisible();
    await source.getByRole('radio', { name: 'My quotes' }).click();
    await expect(screen.getByText('No custom quotes yet: proverbs are used.')).toBeVisible();
    const choices: Record<string, string[]> = { Font: ['Serif', 'Sans-serif'], Position: ['Top', 'Center', 'Bottom'], Size: ['Small', 'Medium', 'Large'], Color: ['Auto', 'White', 'Black'] };
    for (const [group, names] of Object.entries(choices)) {
      for (const name of names) await expect(screen.getByRole('group', { name: group, exact: true }).getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(screen.getByText(/^In Auto mode, the text is white or black depending on the brightness of the wallpaper/)).toBeVisible();

    // Mes citations : ajout, suppression et annulation.
    await expect(screen.getByRole('heading', { name: 'My quotes', exact: true })).toBeVisible();
    await screen.getByRole('button', { name: 'Add a quote' }).click();
    const editor = page.getByRole('dialog', { name: 'New quote' });
    await editor.getByLabel('Quote', { exact: true }).fill('Stay curious.');
    await editor.getByLabel('Author (optional)').fill('Ada');
    await expect(editor.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(snackbar(page, 'Quote added')).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'My quotes (1)' })).toBeVisible();
    await expect(screen.getByRole('listitem').getByText('— Ada')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Edit quote “Stay curious.”' })).toBeVisible();
    await screen.getByRole('button', { name: 'Delete quote “Stay curious.”' }).click();
    await expect(snackbar(page, 'Quote deleted')).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'My quotes', exact: true })).toBeVisible();
    await snackbar(page, 'Quote deleted').getByRole('button').click();
    await expect(screen.getByRole('heading', { name: 'My quotes (1)' })).toBeVisible();
  });

  test('autres écrans : fonds dynamiques, musique, lieux, focus, fêtes, soir', async ({ page }) => {
    await switchToEnglish(page);

    let screen = await openOption(page, 'dynamic');
    await expect(screen.getByRole('heading', { name: 'Dynamic wallpapers', exact: true })).toBeVisible();
    const triggers = screen.getByRole('radiogroup', { name: 'Trigger' });
    for (const name of ['Time', 'Weather', 'Season', 'Battery', 'Dark mode']) await expect(triggers.getByRole('radio', { name })).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Follow the sun' })).toBeVisible();
    for (const name of ['Morning', 'Daytime', 'Evening', 'Night']) await expect(screen.getByRole('button', { name: `Choose wallpaper “${name}”` })).toBeVisible();
    await expect(screen.getByLabel('Start: Morning')).toBeVisible();
    await triggers.getByRole('radio', { name: 'Season' }).click();
    await expect(screen.getByRole('radiogroup', { name: 'Hemisphere' }).getByRole('radio', { name: 'Northern hemisphere' })).toBeVisible();
    for (const name of ['Spring', 'Summer', 'Autumn', 'Winter']) await expect(screen.getByRole('button', { name: `Choose wallpaper “${name}”` })).toBeVisible();
    await triggers.getByRole('radio', { name: 'Battery' }).click();
    for (const name of ['50% and above', '20% to 50%', 'Below 20%', 'Charging']) await expect(screen.getByRole('button', { name: `Choose wallpaper “${name}”` })).toBeVisible();
    await screen.getByRole('button', { name: 'Choose wallpaper “Charging”' }).click();
    await expect(page.getByRole('dialog', { name: 'Wallpaper “Charging”' })).toBeVisible();
    await page.keyboard.press('Escape');
    await back(screen).click();

    screen = await openOption(page, 'music');
    await expect(screen.getByRole('heading', { name: 'Album art', exact: true })).toBeVisible();
    await expect(screen.getByText(/^When music plays in any app, your wallpaper becomes the track’s album art/)).toBeVisible();
    await expect(screen.getByRole('switch', { name: 'Restore previous wallpaper' })).toBeVisible();
    await expect(screen.getByText('About a minute after the music stops')).toBeVisible();
    await back(screen).click();

    screen = await openOption(page, 'places');
    await expect(screen.getByRole('heading', { name: 'By location', exact: true })).toBeVisible();
    await expect(screen.getByText('No locations yet.')).toBeVisible();
    const names = screen.getByRole('group', { name: 'Suggested names' });
    for (const name of ['Home', 'Work', 'School', 'Family']) await expect(names.getByRole('button', { name, exact: true })).toBeVisible();
    await names.getByRole('button', { name: 'Work', exact: true }).click();
    await expect(screen.getByLabel('Location name')).toHaveValue('Work');
    await expect(screen.getByText('Do this on site: the zone will be centered on your location.')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Use my current location' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Add this location' })).toBeDisabled();
    await back(screen).click();

    screen = await openOption(page, 'focus');
    await expect(screen.getByRole('heading', { name: 'Focus mode', exact: true })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Black minimal wallpaper' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Slate minimal wallpaper' })).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Time ranges' })).toBeVisible();
    const days = screen.getByLabel('Days').first();
    for (const [name, initial] of [['Monday', 'M'], ['Tuesday', 'T'], ['Wednesday', 'W'], ['Thursday', 'T'], ['Friday', 'F'], ['Saturday', 'S'], ['Sunday', 'S']]) {
      await expect(days.getByRole('button', { name })).toHaveText(initial!);
    }
    await expect(screen.getByRole('button', { name: 'Add a time range' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Try it now' })).toBeDisabled();
    await back(screen).click();

    screen = await openOption(page, 'events');
    await expect(screen.getByRole('heading', { name: 'Holidays and dates', exact: true })).toBeVisible();
    for (const name of ['New Year’s Day', 'Valentine’s Day', 'Easter', 'World Music Day', 'Bastille Day', 'Halloween', 'Christmas']) {
      await expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(screen.getByRole('status').filter({ hasText: /^Next: / })).toBeVisible();
    await screen.getByLabel('Name', { exact: true }).fill('Léa’s birthday');
    await screen.getByLabel('Date', { exact: true }).fill('2026-12-01');
    await screen.getByRole('button', { name: 'Add date' }).click();
    await expect(snackbar(page, '“Léa’s birthday” added')).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Delete “Léa’s birthday”' })).toBeVisible();
    await expect(screen.getByText(/^1 December · online: “celebration”/)).toBeVisible();
    await back(screen).click();

    screen = await openOption(page, 'dim');
    await expect(screen.getByRole('heading', { name: 'Dim in the evening', exact: true })).toBeVisible();
    await expect(screen.getByRole('status').filter({ hasText: /^Tonight: from \d\d:\d\d, up to 40%; back to normal at \d\d:\d\d/ })).toBeVisible();
    for (const name of ['Light (25%)', 'Medium (40%)', 'Strong (55%)']) await expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Location', exact: true })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
    await screen.getByLabel('City', { exact: true }).fill('Lyon');
    await screen.getByRole('button', { name: 'Search', exact: true }).click();
    await screen.getByRole('button', { name: /^Lyon/ }).click();
    await expect(screen.getByText('Selected location')).toBeVisible();
  });
});
