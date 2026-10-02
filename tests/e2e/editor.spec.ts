import { type Locator, type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';
import { scene } from './scene';

test.describe.configure({ timeout: 90_000 });

type Pixel = [number, number, number, number];

const IMAGE_CDN = /https:\/\/images\.(unsplash|pexels)\.com\/.*/;
/** Photo en paysage (3:2) : ciel dégradé, soleil, montagnes ; carré rouge en haut à gauche, bleu en bas à droite. */
const LANDSCAPE = scene(480, 320);

/** Ouvre l'éditeur sur la première photo de l'explorateur ; `photo` remplace les images unies des API. */
async function openEditor(page: Page, photo?: Buffer) {
  await mockApis(page);
  if (photo) {
    await page.route(IMAGE_CDN, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: photo }),
    );
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.locator('.tab[data-active="true"]').getByRole('switch', { name: 'Éditeur' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.locator('.tab[data-active="true"] .wp-cell').first().click();
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.getByRole('button', { name: 'Retoucher' }).click();
  const editor = page.getByRole('dialog', { name: 'Éditeur' });
  await expect(editor.locator('.editor__loading')).toHaveCount(0);
  return editor;
}

/** Pixel de l'aperçu, à la position (fx, fy) exprimée en fraction de la largeur et de la hauteur. */
const pixelAt = (editor: Locator, fx: number, fy: number) =>
  editor.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, [px, py]) => {
      const x = Math.min(canvas.width - 1, Math.floor(canvas.width * px));
      const y = Math.min(canvas.height - 1, Math.floor(canvas.height * py));
      return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data) as Pixel;
    },
    [fx, fy] as const,
  );

/** Attend (l'aperçu se redessine à la prochaine image d'animation) qu'un pixel soit à `tolerance` près de la couleur attendue. */
async function expectPixel(editor: Locator, fx: number, fy: number, expected: readonly number[], tolerance = 6) {
  await expect
    .poll(async () => {
      const p = await pixelAt(editor, fx, fy);
      return Math.max(...expected.map((v, i) => Math.abs((p[i] as number) - v)));
    }, { message: `pixel (${fx}, ${fy}) ≈ ${expected.join(', ')}` })
    .toBeLessThanOrEqual(tolerance);
}

/**
 * Mesures de l'aperçu : nombre de couleurs distinctes, part de pixels très sombres, et « rugosité »
 * (écart moyen entre pixels voisins : un aplat lissé est bien plus calme qu'une photo grainée).
 */
const statistics = (editor: Locator) =>
  editor.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<number>();
    let dark = 0;
    let rough = 0;
    for (let i = 0; i < data.length; i += 4) {
      colors.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
      if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) < 45) dark++;
      if ((i / 4 + 1) % canvas.width !== 0 && i + 4 < data.length) rough += Math.abs(data[i + 4]! - data[i]!);
    }
    const pixels = canvas.width * canvas.height;
    return { colors: colors.size, dark: dark / pixels, rough: rough / pixels };
  });

/** Couleur de fond d'un élément (rgb(r, g, b) → [r, g, b]). */
const backgroundOf = async (locator: Locator) =>
  (await locator.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g)!.slice(0, 3).map(Number) as [number, number, number];

const pressed = (locator: Locator, value = true) => expect(locator).toHaveAttribute('aria-pressed', String(value));

test('paysage : l’ajustement est proposé d’office, photo entière sur bords flous ou couleur dominante', async ({ page }) => {
  const editor = await openEditor(page, LANDSCAPE);

  // Photo en paysage : l'onglet « Ajustement » s'ouvre tout seul, « Remplir » reste le choix actuel.
  await expect(editor.getByRole('tab', { name: 'Ajustement' })).toHaveAttribute('aria-selected', 'true');
  const fill = editor.getByRole('button', { name: 'Remplir (recadrer)' });
  const blur = editor.getByRole('button', { name: 'Entière, bords flous' });
  const color = editor.getByRole('button', { name: 'Entière, couleur dominante' });
  await pressed(fill);
  // Remplir rogne les côtés : le carré rouge du coin n'est pas visible.
  await expect.poll(async () => (await pixelAt(editor, 0.5, 0.5))[3]).toBe(255);
  const corner = await pixelAt(editor, 0.03, 0.03);
  expect(corner[0] > 200 && corner[1] < 60 && corner[2] < 60).toBe(false);
  await expect(editor.getByText('Photo en paysage')).toBeVisible();

  // Bords flous : la photo entière, centrée (le paysage 3:2 occupe toute la largeur, au milieu de la hauteur).
  await blur.click();
  await pressed(blur);
  await pressed(fill, false);
  await expectPixel(editor, 0.03, 0.365, [255, 0, 0]);
  await expectPixel(editor, 0.97, 0.635, [0, 0, 255]);
  // Au-dessus et au-dessous : une copie floutée de la photo (ciel en haut, prairie en bas), jamais du vide.
  await expect.poll(async () => {
    const [r, , b, a] = await pixelAt(editor, 0.5, 0.05);
    return a === 255 && b > r;
  }).toBe(true);
  await expect.poll(async () => {
    const [r, g, b, a] = await pixelAt(editor, 0.5, 0.95);
    return a === 255 && g > r && g > b;
  }).toBe(true);

  // Couleur dominante : bords unis, de la couleur de la première pastille.
  await color.click();
  await pressed(color);
  const dominant = editor.getByRole('radio', { name: 'Couleur dominante' });
  await expect(dominant).toHaveAttribute('aria-checked', 'true');
  const expected = await backgroundOf(dominant);
  await expectPixel(editor, 0.5, 0.05, expected, 3);
  await expectPixel(editor, 0.1, 0.9, expected, 3);
  await expectPixel(editor, 0.03, 0.365, [255, 0, 0]);

  // Autre couleur au choix : noir, puis une couleur libre.
  await editor.getByRole('radio', { name: 'Noir' }).click();
  await expectPixel(editor, 0.5, 0.05, [0, 0, 0], 2);
  await editor.getByLabel('Couleur personnalisée').fill('#336699');
  await expectPixel(editor, 0.5, 0.05, [0x33, 0x66, 0x99], 3);

  // Retour à « Remplir » : plus de bords.
  await fill.click();
  await expect.poll(async () => (await pixelAt(editor, 0.5, 0.02))[3]).toBe(255);
  await expect(editor.getByRole('radio', { name: 'Noir' })).toHaveCount(0);
});

test('recadrage : rotation, miroir, redressement sans coin vide, déplacement et zoom', async ({ page }) => {
  const editor = await openEditor(page, LANDSCAPE);
  const canvas = editor.locator('canvas');

  // Photo entière pour suivre les carrés repères : tourner la photo les déplace.
  await editor.getByRole('button', { name: 'Entière, bords flous' }).click();
  await editor.getByRole('tab', { name: 'Recadrage' }).click();
  await expectPixel(editor, 0.03, 0.365, [255, 0, 0]);

  // Un quart de tour vers la droite : la photo devient verticale, bien plus haute ;
  // le coin rouge passe en haut à droite, le bleu en bas à gauche.
  await editor.getByRole('button', { name: 'Pivoter à droite' }).click();
  await expectPixel(editor, 0.97, 0.175, [255, 0, 0]);
  await expectPixel(editor, 0.03, 0.825, [0, 0, 255]);

  // Miroir horizontal : le rouge repasse à gauche.
  const mirror = editor.getByRole('button', { name: 'Miroir horizontal' });
  await mirror.click();
  await pressed(mirror);
  await expectPixel(editor, 0.03, 0.175, [255, 0, 0]);
  await expectPixel(editor, 0.97, 0.825, [0, 0, 255]);
  await mirror.click();
  await pressed(mirror, false);

  // Un quart de tour vers la gauche, puis « Rétablir le cadrage » : on retrouve la photo d'origine.
  await editor.getByRole('button', { name: 'Pivoter à gauche' }).click();
  await expectPixel(editor, 0.03, 0.365, [255, 0, 0]);
  // Encore un quart de tour vers la gauche : le rouge descend en bas à gauche, le bleu monte en haut à droite.
  await editor.getByRole('button', { name: 'Pivoter à gauche' }).click();
  await expectPixel(editor, 0.03, 0.825, [255, 0, 0]);
  await expectPixel(editor, 0.97, 0.175, [0, 0, 255]);
  await editor.getByRole('button', { name: 'Rétablir le cadrage' }).click();
  await expectPixel(editor, 0.03, 0.365, [255, 0, 0]);

  // Redressement : l'aperçu ne montre jamais de coin vide (agrandissement automatique), dans les deux sens.
  await expect(editor.getByText('Le déplacement et le zoom ne servent qu’avec « Remplir (recadrer) ».')).toBeVisible();
  await expect(editor.getByLabel('Zoom')).toBeDisabled();
  await editor.getByRole('tab', { name: 'Ajustement' }).click();
  await editor.getByRole('button', { name: 'Remplir (recadrer)' }).click();
  await editor.getByRole('tab', { name: 'Recadrage' }).click();
  for (const degrees of ['15', '-15', '-7.5']) {
    await editor.getByLabel('Redressement').fill(degrees);
    await expect(editor.getByText(degrees === '-7.5' ? '−7,5°' : `${degrees.startsWith('-') ? '−' : '+'}15°`)).toBeVisible();
    await expect
      .poll(async () => {
        const alphas = await Promise.all([
          pixelAt(editor, 0.001, 0.001),
          pixelAt(editor, 0.999, 0.001),
          pixelAt(editor, 0.001, 0.999),
          pixelAt(editor, 0.999, 0.999),
          pixelAt(editor, 0.5, 0.001),
          pixelAt(editor, 0.001, 0.5),
        ]);
        return alphas.map((p) => p[3]);
      })
      .toEqual([255, 255, 255, 255, 255, 255]);
  }
  await editor.getByLabel('Redressement').fill('0');
  await expect(editor.getByText('0°', { exact: true })).toBeVisible();

  // Déplacement à la souris : en glissant l'aperçu vers la gauche, le soleil (au bord droit de la zone, à 68 % de la photo)
  // arrive au centre. La zone fait 30 % de la largeur de la photo : il faut la décaler de 18 %, soit 60 % de l'aperçu.
  const sun = [255, 240, 200] as const;
  await expect.poll(async () => Math.max(...(await pixelAt(editor, 0.5, 0.5)).slice(0, 3).map((v, i) => Math.abs(v - sun[i]!)))).toBeGreaterThan(40);
  const box = (await canvas.boundingBox())!;
  const from = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - box.width * 0.6, from.y, { steps: 10 });
  await page.mouse.up();
  await expectPixel(editor, 0.5, 0.5, sun, 14);

  // Molette : zoom autour du pointeur ; le curseur de zoom suit.
  await expect(editor.getByText('×1,0')).toBeVisible();
  await page.mouse.move(from.x, from.y);
  await page.mouse.wheel(0, -400);
  await expect(editor.getByLabel('Zoom')).not.toHaveValue('1');
  // Curseur de zoom : valeur lisible, bornée.
  await editor.getByLabel('Zoom').fill('2.5');
  await expect(editor.getByText('×2,5')).toBeVisible();

  // « Réinitialiser » remet tout à plat.
  await editor.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await expect(editor.getByText('×1,0')).toBeVisible();
  await expect(editor.getByText('0°', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Miroir horizontal' })).toHaveAttribute('aria-pressed', 'false');
});

test('filtres : vignettes, intensité, duotone Material You et noir et blanc d’origine', async ({ page }) => {
  // Photo unie : les couleurs attendues se calculent à la main, à partir de la couleur de départ.
  const editor = await openEditor(page);
  await editor.getByRole('tab', { name: 'Filtres' }).click();
  await expect.poll(async () => (await pixelAt(editor, 0.5, 0.5))[3]).toBe(255);
  const orig = (await pixelAt(editor, 0.5, 0.5)).slice(0, 3) as [number, number, number];
  const gray = 0.2126 * orig[0] + 0.7152 * orig[1] + 0.0722 * orig[2];
  const spread = ([r, g, b]: readonly number[]) => Math.max(r!, g!, b!) - Math.min(r!, g!, b!);

  // Une vignette par filtre, rendue sur la photo.
  const thumbs = editor.locator('.filter-thumb img');
  await expect(thumbs).toHaveCount(8);
  expect(await thumbs.evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const filter = (name: string) => editor.getByRole('button', { name, exact: true });
  await pressed(filter('Aucun'));

  // Noir et blanc : le gris du filtre « grayscale » utilisé jusque-là (0,2126 R + 0,7152 G + 0,0722 B).
  await filter('Noir et blanc').click();
  await pressed(filter('Noir et blanc'));
  await expectPixel(editor, 0.5, 0.5, [gray, gray, gray], 1);
  // Intensité : 0 rend la photo d'origine, 0,5 un mélange à parts égales.
  const intensity = editor.getByLabel('Intensité du filtre');
  await intensity.fill('0.5');
  await expectPixel(editor, 0.5, 0.5, orig.map((v) => (v + gray) / 2), 2);
  await intensity.fill('0');
  await expectPixel(editor, 0.5, 0.5, orig, 1);
  await intensity.fill('1');

  // Sépia : la matrice classique.
  await filter('Sépia').click();
  const [r, g, b] = orig;
  await expectPixel(editor, 0.5, 0.5, [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b].map((v) => Math.min(255, v)), 2);
  // Froid et chaud vont dans des sens opposés.
  await filter('Froid').click();
  await expect.poll(async () => { const [pr, , pb] = await pixelAt(editor, 0.5, 0.5); return pb! - pr!; }).toBeGreaterThan(b - r + 8);
  await filter('Chaud').click();
  await expect.poll(async () => { const [pr, , pb] = await pixelAt(editor, 0.5, 0.5); return pb! - pr!; }).toBeLessThan(b - r - 8);
  // Contraste « punchy » : couleurs plus saturées.
  await filter('Contraste').click();
  await expect.poll(async () => spread(await pixelAt(editor, 0.5, 0.5))).toBeGreaterThan(spread(orig) + 8);
  // Vintage : léger vignettage, les coins sont plus sombres que le centre.
  await filter('Vintage').click();
  await expect.poll(async () => (await pixelAt(editor, 0.5, 0.5))[1]! - (await pixelAt(editor, 0.01, 0.005))[1]!).toBeGreaterThan(6);

  // Duotone : préréglages, dont ceux de la palette Material You, et couleurs libres.
  await filter('Duotone').click();
  const material = editor.getByRole('button', { name: 'Préréglage Material You' });
  await expect(material).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Préréglage Crépuscule' })).toBeVisible();
  await material.click();
  await pressed(material);
  await editor.getByLabel('Couleur des ombres').fill('#000000');
  await editor.getByLabel('Couleur des lumières').fill('#ffffff');
  // Ombres noires, lumières blanches : un gris proche de la luminance de la photo (courbe en S adoucie).
  await expect.poll(async () => spread(await pixelAt(editor, 0.5, 0.5))).toBeLessThanOrEqual(1);
  await expect.poll(async () => Math.abs((await pixelAt(editor, 0.5, 0.5))[0]! - gray)).toBeLessThan(14);
  await expect(material).toHaveAttribute('aria-pressed', 'false');

  // « Réinitialiser » : la photo d'origine.
  await editor.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await expectPixel(editor, 0.5, 0.5, orig, 1);
  await pressed(filter('Aucun'));
});

test('effets artistiques : pixel art, mosaïque, trame, peinture, avec indicateur de rendu à l’export', async ({ page }) => {
  const editor = await openEditor(page, LANDSCAPE);
  await editor.getByRole('button', { name: 'Remplir (recadrer)' }).click();
  await editor.getByRole('tab', { name: 'Effets' }).click();
  const effect = (name: string) => editor.getByRole('button', { name, exact: true });

  // La photo d'origine a des milliers de couleurs (ciel dégradé, grain).
  await expect.poll(async () => (await statistics(editor)).colors).toBeGreaterThan(2000);
  expect((await statistics(editor)).rough).toBeGreaterThan(1.3);

  // Pixel art : pixellisation et palette réduite à 16 couleurs au plus.
  await effect('Pixel art').click();
  await pressed(effect('Pixel art'));
  await expect.poll(async () => (await statistics(editor)).colors).toBeLessThanOrEqual(16);
  expect((await statistics(editor)).colors).toBeGreaterThan(4);
  // Le curseur règle la taille des pixels.
  await expect(editor.getByLabel('Taille des pixels')).toBeVisible();
  await editor.getByLabel('Taille des pixels').fill('1');
  await expect.poll(async () => (await statistics(editor)).colors).toBeLessThanOrEqual(16);

  // Pendant un geste de cadrage, l'effet attend la fin du geste (la photo suit la souris sans à-coup), puis revient.
  await editor.getByRole('tab', { name: 'Recadrage' }).click();
  const box = (await editor.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await statistics(editor)).colors).toBeLessThanOrEqual(16);
  await editor.getByRole('tab', { name: 'Effets' }).click();

  // Mosaïque : tesselles séparées par des joints sombres.
  await effect('Mosaïque').click();
  await expect(editor.getByLabel('Taille des tesselles')).toBeVisible();
  await expect.poll(async () => (await statistics(editor)).dark).toBeGreaterThan(0.05);

  // Trame : points ronds sur fond sombre.
  await effect('Trame').click();
  await expect(editor.getByLabel('Taille de la trame')).toBeVisible();
  await expect.poll(async () => (await statistics(editor)).rough).toBeGreaterThan(8);
  await expect.poll(async () => (await statistics(editor)).dark).toBeGreaterThan(0.015);

  // Peinture : aplats lissés, bien plus calmes que la photo grainée.
  await effect('Peinture').click();
  await expect(editor.getByLabel('Intensité de la peinture')).toBeVisible();
  await expect.poll(async () => (await statistics(editor)).rough).toBeLessThan(1);
  expect((await statistics(editor)).colors).toBeGreaterThan(50);

  // Aucun : retour à la photo d'origine.
  await effect('Aucun').click();
  await expect.poll(async () => (await statistics(editor)).rough).toBeGreaterThan(1.3);
  expect((await statistics(editor)).colors).toBeGreaterThan(2000);
  await expect(editor.getByLabel('Intensité de la peinture')).toHaveCount(0);

  // L'export de la peinture (calcul à la taille de l'écran) affiche « Rendu… » sans bloquer l'interface.
  await effect('Peinture').click();
  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Rendu…' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' })).toBeVisible();
  await expect(editor.getByRole('status').filter({ hasText: 'Rendu…' })).toHaveCount(0);
});

test('enregistrement dans « Créations » : l’image garde la taille de l’écran et le rendu de l’aperçu', async ({ page }) => {
  const editor = await openEditor(page, LANDSCAPE);

  // Photo entière sur fond uni, filtre sépia, pixel art : tout le pipeline, de la géométrie à l'effet.
  await editor.getByRole('button', { name: 'Entière, couleur dominante' }).click();
  await editor.getByRole('tab', { name: 'Recadrage' }).click();
  await editor.getByRole('button', { name: 'Pivoter à droite' }).click();
  await editor.getByRole('tab', { name: 'Filtres' }).click();
  await editor.getByRole('button', { name: 'Sépia', exact: true }).click();
  await editor.getByRole('tab', { name: 'Effets' }).click();
  await editor.getByRole('button', { name: 'Pixel art', exact: true }).click();
  await expect.poll(async () => (await statistics(editor)).colors).toBeLessThanOrEqual(16);

  // Moyenne de blocs de l'aperçu : fond (haut, bas) et photo (centre).
  const regions = [
    [0.4, 0.04, 0.6, 0.1],
    [0.4, 0.9, 0.6, 0.96],
    [0.3, 0.45, 0.7, 0.55],
  ] as const;
  const averages = (target: Locator) =>
    target.evaluate((el, boxes) => {
      const source = el as HTMLCanvasElement | HTMLImageElement;
      const width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
      const height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(source, 0, 0);
      return boxes.map(([x0, y0, x1, y1]) => {
        const { data } = ctx.getImageData(Math.floor(x0 * width), Math.floor(y0 * height), Math.max(1, Math.floor((x1 - x0) * width)), Math.max(1, Math.floor((y1 - y0) * height)));
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
        return sum.map((v) => v / (data.length / 4));
      });
    }, regions);
  const preview = await averages(editor.locator('canvas'));

  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' })).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Voir' }).click();

  // La création s'ouvre dans l'aperçu : image à la taille de l'écran (portrait, ratio de l'écran).
  // L'aperçu d'origine reste dessous : on vise l'image de la retouche.
  const saved = page.locator('.preview__image[alt^="Retouche de"]');
  await expect(saved).toBeVisible();
  await expect.poll(() => saved.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const screen = await page.evaluate(() => {
    const density = window.devicePixelRatio || 1;
    const w = Math.round(window.screen.width * density);
    const h = Math.round(window.screen.height * density);
    return { width: Math.min(w, h), height: Math.max(w, h) };
  });
  expect(await saved.evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }))).toEqual(screen);

  // Même rendu que l'aperçu (à la compression JPEG et à la résolution près).
  const exported = await averages(saved);
  regions.forEach((_, i) => {
    for (let c = 0; c < 3; c++) expect(Math.abs((exported[i]![c] as number) - (preview[i]![c] as number)), `bloc ${i}, canal ${c}`).toBeLessThan(14);
  });

  // La collection « Créations » contient maintenant l'image.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  const library = page.locator('.tab[data-active="true"]');
  await library.getByRole('radio', { name: 'Collections' }).click();
  await expect(library.getByRole('button', { name: /Créations/ })).toContainText(/1 fond/);
});
