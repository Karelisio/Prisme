import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { mockApis } from './mocks';

// Captures à la demande : PRISME_GENERATOR_SHOTS=/dossier npx playwright test generator

async function openGenerator(page: Page) {
  await mockApis(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.locator('.tab[data-active="true"]').getByRole('switch', { name: 'Générateur minimaliste' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.getByRole('button', { name: 'Créer' }).click();
  return page.getByRole('dialog', { name: 'Générateur' });
}

/** Empreinte de l'aperçu : nombre de teintes distinctes et hachage d'un pixel sur sept. */
async function preview(page: Page) {
  return page
    .getByRole('dialog', { name: 'Générateur' })
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { width, height } = canvas;
      const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
      const colors = new Set<number>();
      let hash = 2166136261;
      for (let i = 0; i < data.length; i += 28) {
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        hash = Math.imul(hash ^ (r | (g << 8) | (b << 16)), 16777619);
      }
      return { colors: colors.size, hash: hash >>> 0 };
    });
}

const GRADIENTS = ['Uni', 'Dégradé', 'Radial', 'Aurore', 'Organique'];
const PATTERNS = ['Géométrique', 'Pois', 'Vagues', 'Bauhaus', 'Rayures', 'Terrazzo', 'Grille isométrique', 'Formes', 'Dunes'];

test('générateur : styles regroupés en dégradés et motifs', async ({ page }) => {
  const generator = await openGenerator(page);
  const gradients = generator.getByRole('group', { name: 'Dégradés' });
  const patterns = generator.getByRole('group', { name: 'Motifs' });
  for (const name of GRADIENTS) await expect(gradients.getByRole('button', { name, exact: true })).toBeVisible();
  for (const name of PATTERNS) await expect(patterns.getByRole('button', { name, exact: true })).toBeAttached();
  // Un seul style est choisi à la fois, dans n'importe quelle famille.
  await patterns.getByRole('button', { name: 'Pois', exact: true }).click();
  await expect(patterns.getByRole('button', { name: 'Pois', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(gradients.getByRole('button', { name: 'Aurore', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('générateur : seuls les réglages du style choisi sont affichés', async ({ page }) => {
  const generator = await openGenerator(page);
  const slider = (name: string) => generator.getByLabel(name, { exact: true });
  const shape = generator.getByRole('radiogroup', { name: 'Forme des tuiles' });
  const points = generator.getByRole('radiogroup', { name: 'Nombre de points' });

  // Style de départ (aurore) : seulement le grain.
  await expect(slider('Grain')).toBeVisible();
  for (const name of ['Échelle', 'Rotation', 'Douceur', 'Angle']) await expect(slider(name)).toHaveCount(0);

  await generator.getByRole('button', { name: 'Géométrique', exact: true }).click();
  await expect(shape).toBeVisible();
  await expect(shape.getByRole('radio')).toHaveCount(3);
  for (const name of ['Échelle', 'Écart', 'Rotation', 'Grain']) await expect(slider(name)).toBeVisible();
  await expect(points).toHaveCount(0);

  await generator.getByRole('button', { name: 'Pois', exact: true }).click();
  await expect(shape).toHaveCount(0);
  for (const name of ['Échelle', 'Taille', 'Rotation']) await expect(slider(name)).toBeVisible();

  await generator.getByRole('button', { name: 'Bauhaus', exact: true }).click();
  await expect(slider('Rotation')).toHaveCount(0);
  await expect(slider('Épaisseur')).toBeVisible();

  await generator.getByRole('button', { name: 'Organique', exact: true }).click();
  await expect(points).toBeVisible();
  await expect(points.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
  await expect(slider('Douceur')).toBeVisible();
  await expect(slider('Échelle')).toHaveCount(0);

  await generator.getByRole('button', { name: 'Dégradé', exact: true }).click();
  await expect(slider('Angle')).toBeVisible();
  await expect(points).toHaveCount(0);
});

test('générateur : motif, dégradé organique, « Varier », enregistrement et application', async ({ page }, info) => {
  const generator = await openGenerator(page);
  const gradients = generator.getByRole('group', { name: 'Dégradés' });
  const patterns = generator.getByRole('group', { name: 'Motifs' });

  // Un motif aux couleurs Material You, puis un réglage de rotation.
  await generator.getByRole('button', { name: 'Palette Material You' }).click();
  await patterns.getByRole('button', { name: 'Bauhaus', exact: true }).click();
  await expect.poll(async () => (await preview(page)).colors).toBeGreaterThan(3);
  await patterns.getByRole('button', { name: 'Rayures', exact: true }).click();
  await generator.getByLabel('Rotation', { exact: true }).fill('30');
  await expect(generator.getByText('30°')).toBeVisible();
  const stripes = await preview(page);
  expect(stripes.colors).toBeGreaterThan(1);

  // « Varier » change la composition, sans toucher aux réglages.
  await generator.getByRole('button', { name: 'Varier' }).click();
  await expect.poll(async () => (await preview(page)).hash).not.toBe(stripes.hash);
  await expect(generator.getByLabel('Rotation', { exact: true })).toHaveValue('30');

  // Dégradé organique : nombre de points et douceur.
  await gradients.getByRole('button', { name: 'Organique', exact: true }).click();
  await expect.poll(async () => (await preview(page)).colors).toBeGreaterThan(10);
  const four = await preview(page);
  await generator.getByRole('radio', { name: '6', exact: true }).click();
  await expect(generator.getByRole('radio', { name: '6', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await preview(page)).hash).not.toBe(four.hash);
  await generator.getByLabel('Douceur', { exact: true }).fill('0.9');
  const mesh = await preview(page);
  await generator.getByRole('button', { name: 'Varier' }).click();
  await expect.poll(async () => (await preview(page)).hash).not.toBe(mesh.hash);
  await page.screenshot({ path: info.outputPath('generator-mesh.png') });

  await generator.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Enregistré dans la collection « Créations »' })).toBeVisible();
  await generator.getByRole('button', { name: 'Appliquer' }).click();
  await page.getByRole('button', { name: "Écran d'accueil" }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Fond appliqué' })).toBeVisible();
  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied.at(-1)).toMatchObject({ target: 'home' });
  expect(applied.at(-1)?.uri).toMatch(/^blob:/);
});

test('générateur : chaque style donne un aperçu varié', async ({ page }) => {
  const dir = process.env.PRISME_GENERATOR_SHOTS;
  if (dir) mkdirSync(dir, { recursive: true });
  const generator = await openGenerator(page);
  await generator.getByRole('button', { name: 'Palette Material You' }).click();
  for (const name of [...GRADIENTS, ...PATTERNS]) {
    await generator.getByRole('button', { name, exact: true }).click();
    await expect(generator.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(150);
    await expect.poll(async () => (await preview(page)).colors, { message: `aperçu « ${name} »` }).toBeGreaterThan(1);
    if (dir) await page.screenshot({ path: join(dir, `ui-${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-')}.png`) });
  }
});
