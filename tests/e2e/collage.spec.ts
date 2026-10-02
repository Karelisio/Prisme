import { type Locator, type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

const collage = (page: Page) => page.getByRole('dialog', { name: 'Collage' });
const cell = (page: Page, n: number) => collage(page).getByRole('button', { name: new RegExp(`^Case ${n} :`) });
const cellCount = (page: Page) => collage(page).locator('.collage-cell');
const saveButton = (page: Page) => collage(page).getByRole('button', { name: 'Enregistrer' });
const saved = (page: Page) => page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' });
const categories = (page: Page) => page.getByRole('navigation', { name: 'Catégories' });

const LAYOUT_GRID4 = 'Quatre photos en grille 2×2';
const LAYOUT_BIG2SMALL = 'Trois photos, une grande et deux petites';
const LAYOUT_STACK2 = 'Deux photos, l’une au-dessus de l’autre';
const LAYOUT_POLAROID3 = 'Trois polaroïds éparpillés';

async function addFavorites(page: Page, count: number) {
  for (let i = 0; i < count; i++) {
    await page.locator('.tab[data-active="true"] .wp-cell').nth(i).click();
    await page.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.keyboard.press('Escape');
  }
}

async function enableCollage(page: Page) {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.locator('.tab[data-active="true"]').getByRole('switch', { name: 'Générateur de fonds' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
}

async function openCollage(page: Page) {
  await categories(page).getByRole('button', { name: 'Collage' }).click();
  await expect(collage(page)).toBeVisible();
}

/** Remplit la case `n` avec la `index`-ième photo de la liste des favoris. */
async function fillCell(page: Page, n: number, index: number) {
  await cell(page, n).click();
  const picker = page.getByRole('dialog', { name: 'Choisir une photo' });
  await picker.locator('.picker__item').nth(index).click();
  await expect(picker).toBeHidden();
  await expect(cell(page, n)).not.toHaveAccessibleName(/vide/);
}

const centerOf = async (target: Locator) => {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Couleur RVB d'un point de page lu dans le canevas d'aperçu (ses pixels, pas ceux de l'écran). */
const pixelAt = (page: Page, point: { x: number; y: number }) =>
  collage(page)
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement, p) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round(((p.x - rect.left) / rect.width) * canvas.width)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round(((p.y - rect.top) / rect.height) * canvas.height)));
      const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
      return [r, g, b];
    }, point);

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

/** Alt de la photo d'une case, d'après son intitulé « Case 2 : alt ». */
const altOf = async (target: Locator) => ((await target.getAttribute('aria-label')) ?? '').replace(/^Case \d+ : /, '');

/** Milieu de l'écart qui sépare deux cases voisines, à hauteur du centre de la première. */
async function gapBetween(a: Locator, b: Locator) {
  const [boxA, boxB] = [(await a.boundingBox())!, (await b.boundingBox())!];
  return { x: (boxA.x + boxA.width + boxB.x) / 2, y: boxA.y + boxA.height / 2 };
}

test('sans l’option, ni puce « Collage » ni raccourci dans la bibliothèque', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await expect(categories(page).getByRole('button', { name: 'Créer' })).toHaveCount(0);
  await expect(categories(page).getByRole('button', { name: 'Collage' })).toHaveCount(0);
  await addFavorites(page, 2);
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  await expect(page.locator('.tab[data-active="true"] .wp-cell')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Collage avec mes favoris' })).toHaveCount(0);
});

test('collage : dispositions, cases remplies depuis les favoris, échange, cadrage, réglages, fond et enregistrement', async ({ page }) => {
  const log = await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 4);
  await enableCollage(page);
  await openCollage(page);

  // Départ : trois cases vides (une grande et deux petites), rien à enregistrer.
  await expect(collage(page).getByRole('radio', { name: LAYOUT_BIG2SMALL })).toHaveAttribute('aria-checked', 'true');
  await expect(cellCount(page)).toHaveCount(3);
  await expect(cell(page, 1)).toHaveAccessibleName(/vide/);
  await expect(saveButton(page)).toBeDisabled();
  await expect(collage(page).getByRole('button', { name: 'Appliquer' })).toBeDisabled();

  // Une grille 2×2 : quatre cases, remplies une à une depuis les favoris.
  await collage(page).getByRole('radio', { name: LAYOUT_GRID4 }).click();
  await expect(cellCount(page)).toHaveCount(4);
  for (let n = 1; n <= 4; n++) await fillCell(page, n, n - 1);
  await expect(saveButton(page)).toBeEnabled();
  const alts = [await altOf(cell(page, 1)), await altOf(cell(page, 2)), await altOf(cell(page, 3)), await altOf(cell(page, 4))];
  expect(new Set(alts).size).toBe(4);
  // Chaque case montre sa photo (ni le fond noir, ni le creux des cases vides).
  for (let n = 1; n <= 4; n++) {
    const pixel = await pixelAt(page, await centerOf(cell(page, n)));
    expect(pixel).not.toEqual(BLACK);
    expect(pixel.every((v) => v === pixel[0])).toBe(false);
  }

  // Échange : la photo de la case 1 passe en case 2 et inversement.
  await cell(page, 1).click();
  await expect(cell(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await collage(page).getByRole('button', { name: 'Échanger avec une autre case' }).click();
  await expect(collage(page).getByText('Touche la case à échanger avec la case 1.')).toBeVisible();
  await cell(page, 2).click();
  expect(await altOf(cell(page, 1))).toBe(alts[1]);
  expect(await altOf(cell(page, 2))).toBe(alts[0]);
  await expect(cell(page, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(collage(page).getByText('Touche la case à échanger')).toHaveCount(0);

  // Cadrage de la case 3 : à la souris, glisser (sur l'axe libre seulement) et molette pour zoomer.
  await cell(page, 3).click();
  const recenter = collage(page).getByRole('button', { name: 'Recentrer la photo' });
  await expect(recenter).toBeDisabled();
  const middle = await centerOf(cell(page, 3));
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y + 60, { steps: 5 });
  await page.mouse.up();
  // La photo remplit déjà toute la hauteur de la case : un glissé vertical ne change rien.
  await expect(recenter).toBeDisabled();
  await expect(cell(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 25, middle.y, { steps: 5 });
  await page.mouse.up();
  await expect(recenter).toBeEnabled();
  await recenter.click();
  await expect(recenter).toBeDisabled();
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.wheel(0, -300);
  await expect(recenter).toBeEnabled();
  await recenter.click();
  await expect(recenter).toBeDisabled();

  // Pincer : deux pointeurs qui s'écartent zooment.
  await cell(page, 3).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const [cx, cy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
    const fire = (type: string, id: number, x: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true }));
    fire('pointerdown', 1, cx - 20);
    fire('pointerdown', 2, cx + 20);
    for (let i = 1; i <= 6; i++) {
      fire('pointermove', 2, cx + 20 + i * 8);
      fire('pointermove', 1, cx - 20 - i * 8);
    }
    fire('pointerup', 1, cx - 68);
    fire('pointerup', 2, cx + 68);
  });
  await expect(recenter).toBeEnabled();
  await recenter.click();

  // Réglages : l'espacement ouvre un écart de la couleur du fond, à 0 les photos se touchent.
  await collage(page).getByRole('tab', { name: 'Réglages' }).click();
  await collage(page).getByRole('slider', { name: 'Espacement' }).fill('24');
  await expect(collage(page).getByText('24 px')).toBeVisible();
  await expect.poll(async () => pixelAt(page, await gapBetween(cell(page, 1), cell(page, 2)))).toEqual(BLACK);
  await collage(page).getByRole('slider', { name: 'Espacement' }).fill('0');
  await expect.poll(async () => pixelAt(page, await gapBetween(cell(page, 1), cell(page, 2)))).not.toEqual(BLACK);
  // Coins arrondis : à 0, le coin de la première case est de la couleur de sa photo.
  const corner = async () => {
    const box = (await cell(page, 1).boundingBox())!;
    return pixelAt(page, { x: box.x + 1.5, y: box.y + 1.5 });
  };
  await collage(page).getByRole('slider', { name: 'Coins arrondis' }).fill('40');
  await expect.poll(corner).toEqual(BLACK);
  await collage(page).getByRole('slider', { name: 'Coins arrondis' }).fill('0');
  await expect.poll(corner).not.toEqual(BLACK);
  await collage(page).getByRole('slider', { name: 'Espacement' }).fill('12');
  await collage(page).getByRole('slider', { name: 'Coins arrondis' }).fill('16');

  // Fond : blanc, puis la couleur dominante de la première photo, relue sur la pastille.
  await collage(page).getByRole('tab', { name: 'Fond' }).click();
  await expect(collage(page).getByRole('radio', { name: 'Noir' })).toHaveAttribute('aria-checked', 'true');
  await collage(page).getByRole('radio', { name: 'Blanc' }).click();
  const outside = async () => {
    const box = (await collage(page).locator('canvas').boundingBox())!;
    return pixelAt(page, { x: box.x + 3, y: box.y + box.height / 2 });
  };
  await expect.poll(outside).toEqual(WHITE);
  await expect(collage(page).getByRole('radio', { name: 'Material You : couleur principale' })).toBeVisible();
  const dominant = collage(page).getByRole('radio', { name: 'Couleur dominante de la photo 1' });
  await dominant.click();
  const rgb = await dominant.evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
  await expect.poll(outside).toEqual(rgb);

  // Retirer une photo bloque l'enregistrement ; la remettre le débloque.
  await cell(page, 4).click();
  await collage(page).getByRole('button', { name: 'Retirer la photo' }).click();
  await expect(cell(page, 4)).toHaveAccessibleName(/vide/);
  await expect(saveButton(page)).toBeDisabled();
  await expect(collage(page).getByText('3 cases sur 4 remplies')).toBeVisible();
  await fillCell(page, 4, 3);
  await expect(saveButton(page)).toBeEnabled();

  // Enregistrement : une seule création, à la taille exacte de l'écran.
  const used = await Promise.all([1, 2, 3, 4].map((n) => altOf(cell(page, n))));
  await saveButton(page).click();
  await expect(saved(page)).toBeVisible();
  // Chaque photo Unsplash du collage est signalée à Unsplash, une fois (les alts « montagne… » viennent d'Unsplash dans les simulations).
  await expect.poll(() => log.downloads.length).toBe(used.filter((alt) => alt.startsWith('montagne')).length);
  await saved(page).getByRole('button', { name: 'Voir' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
  await expect(preview).toBeVisible();
  const size = await preview.locator('.preview__image').evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }));
  const screenSize = await page.evaluate(() => {
    const w = Math.round(screen.width * devicePixelRatio);
    const h = Math.round(screen.height * devicePixelRatio);
    return { width: Math.min(w, h), height: Math.max(w, h) };
  });
  expect(size).toEqual(screenSize);

  // Retour au collage (état conservé), fermeture, puis la création est dans « Créations ».
  await page.keyboard.press('Escape');
  await expect(cell(page, 1)).not.toHaveAccessibleName(/vide/);
  await collage(page).getByRole('button', { name: 'Fermer le collage' }).click();
  await expect(collage(page)).toBeHidden();
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  const library = page.locator('.tab[data-active="true"]');
  await library.getByRole('radio', { name: 'Collections' }).click();
  await expect(library.getByRole('button', { name: /Créations/ })).toContainText('1 fond');
});

test('polaroïds : cartes inclinées avec cadre blanc, photo carrée dans chaque carte', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 3);
  await enableCollage(page);
  await openCollage(page);
  await collage(page).getByRole('radio', { name: LAYOUT_POLAROID3 }).click();
  await expect(cellCount(page)).toHaveCount(3);
  for (let n = 1; n <= 3; n++) await fillCell(page, n, n - 1);
  await expect(saveButton(page)).toBeEnabled();
  await collage(page).getByRole('tab', { name: 'Fond' }).click();
  await collage(page).getByRole('radio', { name: 'Blanc' }).click();

  for (let n = 1; n <= 3; n++) {
    const geometry = await cell(page, n).evaluate((el: HTMLElement) => {
      const style = getComputedStyle(el);
      const matrix = new DOMMatrix(style.transform);
      const rect = el.getBoundingClientRect();
      return {
        angle: Math.atan2(matrix.b, matrix.a),
        center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        padding: { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom), left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) },
        width: el.offsetWidth,
        height: el.offsetHeight,
      };
    });
    expect(Math.abs(geometry.angle)).toBeGreaterThan(0.02);
    // Fenêtre photo carrée, marge basse plus large que la marge haute.
    const windowWidth = geometry.width - geometry.padding.left - geometry.padding.right;
    const windowHeight = geometry.height - geometry.padding.top - geometry.padding.bottom;
    expect(windowWidth).toBeCloseTo(windowHeight, 0);
    expect(geometry.padding.bottom).toBeGreaterThan(geometry.padding.top * 2);
    // Un point de la marge basse (dans le repère de la carte, puis tourné) est de la couleur de la carte, le centre de la photo.
    const rotate = (x: number, y: number) => ({
      x: geometry.center.x + x * Math.cos(geometry.angle) - y * Math.sin(geometry.angle),
      y: geometry.center.y + x * Math.sin(geometry.angle) + y * Math.cos(geometry.angle),
    });
    const frame = rotate(0, geometry.height / 2 - geometry.padding.bottom / 2);
    const photo = rotate(0, (geometry.padding.top - geometry.padding.bottom) / 2);
    await expect.poll(() => pixelAt(page, frame)).toEqual([253, 252, 248]);
    const inside = await pixelAt(page, photo);
    expect(inside).not.toEqual([253, 252, 248]);
    expect(inside).not.toEqual(WHITE);
  }

  // Les polaroïds se superposent dans l'ordre des cases : un coin hors des cartes reste de la couleur du fond.
  const box = (await collage(page).locator('canvas').boundingBox())!;
  await expect.poll(() => pixelAt(page, { x: box.x + 3, y: box.y + 3 })).toEqual(WHITE);
});

test('« Appliquer » enregistre le collage puis ouvre l’aperçu pour l’appliquer', async ({ page }) => {
  const log = await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 2);
  await enableCollage(page);
  await openCollage(page);
  await collage(page).getByRole('radio', { name: LAYOUT_STACK2 }).click();
  await fillCell(page, 1, 0);
  await fillCell(page, 2, 1);
  await expect(collage(page).getByRole('button', { name: 'Appliquer' })).toBeEnabled();
  const unsplash = (await Promise.all([1, 2].map((n) => altOf(cell(page, n))))).filter((alt) => alt.startsWith('montagne')).length;
  await collage(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(saved(page)).toBeVisible();

  // Rien n'a changé depuis l'enregistrement : « Appliquer » reprend la même création (sans second suivi Unsplash).
  await collage(page).getByRole('button', { name: 'Appliquer' }).click();
  const preview = page.getByRole('dialog', { name: 'Aperçu du fond d’écran' });
  await expect(preview).toBeVisible();
  await preview.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: "Écran d'accueil" }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied.at(-1)?.target).toBe('home');
  expect(applied.at(-1)?.uri).toMatch(/^blob:/);
  expect(log.downloads).toHaveLength(unsplash);

  await page.keyboard.press('Escape');
  await collage(page).getByRole('button', { name: 'Fermer le collage' }).click();
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  const library = page.locator('.tab[data-active="true"]');
  await library.getByRole('radio', { name: 'Collections' }).click();
  await expect(library.getByRole('button', { name: /Créations/ })).toContainText('1 fond');
});

test('bibliothèque : « Collage avec mes favoris » préremplit les cases avec les derniers favoris', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await addFavorites(page, 3);
  await enableCollage(page);
  await page.getByRole('button', { name: 'Bibliothèque' }).click();
  const latest = (await page.locator('.tab[data-active="true"] .wp-cell').first().getAttribute('aria-label')) ?? '';
  await page.getByRole('button', { name: 'Collage avec mes favoris' }).click();

  await expect(collage(page)).toBeVisible();
  await expect(collage(page).getByRole('radio', { name: LAYOUT_BIG2SMALL })).toHaveAttribute('aria-checked', 'true');
  await expect(cellCount(page)).toHaveCount(3);
  for (let n = 1; n <= 3; n++) await expect(cell(page, n)).not.toHaveAccessibleName(/vide/);
  await expect(saveButton(page)).toBeEnabled();
  // Les cases suivent l'ordre de la bibliothèque : le dernier favori ajouté est en première case.
  const alts = await Promise.all([1, 2, 3].map((n) => altOf(cell(page, n))));
  expect(new Set(alts).size).toBe(3);
  expect(latest.startsWith(alts[0] ?? '?')).toBe(true);

  // Échap ferme le collage et ramène à la bibliothèque.
  await page.keyboard.press('Escape');
  await expect(collage(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Collage avec mes favoris' })).toBeVisible();
});
