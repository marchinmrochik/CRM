import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const settings = parse(readFileSync('.env'));
test('background operations preserve failures and expose automatic and manual recovery', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page
    .getByLabel('Owner password')
    .fill(process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await page.getByRole('button', { name: 'System activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recent operations' })).toBeVisible();
  await page.getByLabel('Diagnostic scenario').selectOption('transient');
  await page.getByRole('button', { name: 'Run diagnostic' }).click();
  const detail = page.locator('.operation-detail');
  await expect(detail.locator('.section-title > .badge').first()).toHaveText('succeeded', {
    timeout: 20000,
  });
  await expect(detail.locator('.attempt-card')).toHaveCount(2);
  await expect(detail).toContainText('DIAGNOSTIC_TRANSIENT');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/reviews/phase-3/recovery.png', fullPage: true });
  await page.getByLabel('Diagnostic scenario').selectOption('exhausted');
  await page.getByRole('button', { name: 'Run diagnostic' }).click();
  await expect(detail.getByRole('button', { name: 'Retry operation' })).toBeVisible({
    timeout: 25000,
  });
  await expect(detail.locator('.attempt-card')).toHaveCount(3);
  await detail.getByRole('button', { name: 'Retry operation' }).click();
  await expect(detail.locator('.section-title > .badge').first()).toHaveText('succeeded', {
    timeout: 15000,
  });
  await expect(detail.locator('.attempt-card')).toHaveCount(4);
  await page.getByTestId('language-switch').selectOption('ru');
  await expect(page.getByRole('heading', { name: 'История попыток' })).toBeVisible();
  await page.getByTestId('language-switch').selectOption('uk');
  await expect(page.getByRole('heading', { name: 'Історія спроб' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/reviews/phase-3/mobile-history.png', fullPage: true });
});
