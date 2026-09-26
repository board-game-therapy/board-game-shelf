import { test, expect } from '@playwright/test';
test('browse, search by keyboard, inspect multiple evidence images, return to filters', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'What shall we play?' })).toBeVisible();
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.getByRole('combobox', { name: 'Search games', exact: true }).fill('dixit');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.locator('.search-dropdown')).toContainText('Title matches');
  await page.getByRole('combobox', { name: 'Search games', exact: true }).press('ArrowDown');
  await page.getByRole('combobox', { name: 'Search games', exact: true }).press('Enter');
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading', { name: 'Dixit', exact: true })).toBeVisible();
  await expect(modal.getByRole('heading', { name: 'Keep exploring' })).toBeVisible();
  await modal.getByRole('button', { name: /Collection evidence/ }).click();
  await expect(page.locator('.photo-region')).toBeVisible();
  await page.getByRole('button', { name: 'Photo 2', exact: true }).click();
  await expect(page.locator('.evidence-photo img')).toHaveAttribute('src', /IMG_2608/);
  await page.getByRole('button', { name: 'Back to game' }).click();
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search games', exact: true })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Search games', exact: true })).toHaveValue(
    'dixit',
  );
  expect(errors).toEqual([]);
});
test('group filters, empty results and progressive loading work', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('How many players?').selectOption('4');
  await page.getByLabel('Time at the table').selectOption('60');
  await expect(page.locator('.result-line')).toContainText('for your group');
  await page.getByRole('combobox', { name: 'Search games', exact: true }).fill('zzzxqwy');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'No games fit just yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show all games', exact: true }).click();
  await expect(page.locator('.game-card')).toHaveCount(24);
  await page.locator('.load-more').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.game-card').count()).toBeGreaterThan(24);
});
test('contextual proposal is reviewable, downloadable, and does not post before confirmation', async ({
  page,
}) => {
  let posts = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST') posts++;
  });
  await page.goto('./#game=azul');
  await page.getByRole('button', { name: 'Suggest a correction', exact: true }).click();
  await expect(page.getByLabel('Game title', { exact: true })).toHaveValue('Azul');
  await page.getByLabel('Your suggestion').fill('Please verify this edition and its player count.');
  await page.getByRole('button', { name: 'Review suggestion' }).click();
  await expect(page.locator('.proposal-preview')).toContainText('Game key: azul');
  await expect(page.locator('.proposal-preview')).toContainText('Catalog revision:');
  expect(posts).toBe(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('bgt-proposal-azul.md');
});
test('mobile layout, filter access, dialog focus trap and image fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('https://cf.geekdo-images.com/**', (route) => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('How many players?')).toBeVisible();
  await page.getByLabel('How many players?').selectOption('2');
  await page.getByRole('button', { name: /Filters \(1\)/ }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.locator('.game-card').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('annotation tool loads known keys and keeps selection local', async ({ page }) => {
  await page.goto('./annotate.html');
  await expect(page.getByRole('heading', { name: 'Add evidence from a photograph' })).toBeVisible();
  await expect.poll(() => page.locator('#games option').count()).toBeGreaterThanOrEqual(162);
  await page.locator('#file').setInputFiles('public/evidence/IMG_2608.jpeg');
  await page.locator('#photo-id').fill('test-photo');
  await page.locator('#key').fill('dixit');
  await page.getByRole('button', { name: 'Add region to proposal' }).click();
  await expect(page.locator('#output')).toHaveValue(/key: "dixit"/);
  await expect(page.locator('#output')).toHaveValue(/photoId: "test-photo"/);
});
