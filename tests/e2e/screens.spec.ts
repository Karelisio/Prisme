import { test } from '@playwright/test';
import { mockApis } from './mocks';

// Captures pour contrôle visuel, à la demande : PRISME_SCREENSHOTS=1 npx playwright test screens
test('captures', async ({ page }, info) => {
  test.skip(!process.env.PRISME_SCREENSHOTS, 'Captures à la demande');
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await mockApis(page);
  await page.goto('/');
  await page.locator('.wp-cell').first().click();
  await page.waitForTimeout(500);
  await shot('preview');
  await page.getByRole('radio', { name: 'Simuler l’écran de verrouillage' }).click();
  await shot('preview-lock');
  await page.getByRole('radio', { name: 'Simuler l’écran d’accueil' }).click();
  await shot('preview-home');
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await page.waitForTimeout(400);
  await shot('apply-sheet');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Packs' }).click();
  await page.waitForTimeout(300);
  await shot('packs');
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.waitForTimeout(300);
  await shot('settings');
  await page.locator('.tab[data-active="true"]').getByRole('radio', { name: 'Sombre' }).click();
  await page.getByRole('button', { name: 'Explorer' }).click();
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.waitForTimeout(400);
  await shot('filters-dark');
});
