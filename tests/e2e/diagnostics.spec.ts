import { expect, test } from '@playwright/test';

test('le diagnostic applique un fond test via le pont natif simulé', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Diagnostic' })).toBeVisible();
  await expect(page.getByText('Navigateur (simulation)')).toBeVisible();

  await page.getByRole('button', { name: 'Les deux' }).click();
  await expect(page.getByText(/Appliqué \(Les deux/)).toBeVisible();

  const applied = await page.evaluate(() => window.__prismeWeb?.applied ?? []);
  expect(applied).toHaveLength(1);
  expect(applied[0]).toMatchObject({ target: 'both', id: 'test-both' });
  await expect(page.getByAltText('Dernière image appliquée')).toBeVisible();
});
