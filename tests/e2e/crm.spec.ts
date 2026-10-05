import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const settings = parse(readFileSync('.env'));
test('manual CRM journey persists submission evidence and interview history', async ({ page }) => {
  const name = `Review Company ${Date.now()}`;
  const resumeName = `synthetic-review-${Date.now()}.pdf`;
  await page.goto('/');
  await page.getByLabel('Owner password').fill(settings.OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Companies', exact: true }).click();
  await page.getByRole('button', { name: 'Add company', exact: true }).click();
  await page.getByLabel('Company name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Vacancies', exact: true }).click();
  await page.getByRole('button', { name: 'Save vacancy', exact: true }).click();
  await page.getByLabel('Company', { exact: true }).selectOption({ label: name });
  await page.getByLabel('Role title').fill('Senior React Engineer');
  await page
    .getByLabel('Full job description')
    .fill('Remote React and TypeScript position. Location eligibility requires confirmation.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const vacancyCard = page.locator('.vacancy-card').filter({ hasText: name });
  await expect(
    vacancyCard.getByRole('heading', { name: 'Senior React Engineer', exact: true }),
  ).toBeVisible();
  await vacancyCard.getByRole('button', { name: 'Prepare application' }).click();
  await expect(page.getByRole('heading', { name: 'Activity timeline' })).toBeVisible();
  const applicationUrl = page.url();
  await page.getByRole('button', { name: 'Resumes', exact: true }).click();
  await page
    .getByLabel('Resume PDF')
    .setInputFiles({
      name: resumeName,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n1 0 obj <</Type/Catalog>> endobj\n%%EOF'),
    });
  await page.getByRole('button', { name: 'Upload PDF' }).click();
  await expect(page.getByRole('heading', { name: resumeName })).toBeVisible();
  await page.goto(applicationUrl);
  await page.getByLabel('New status').selectOption('applied');
  await page.getByLabel('Resume actually sent').selectOption({ label: resumeName });
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByText('Draft → Applied', { exact: true })).toBeVisible();
  await page
    .getByLabel('Note', { exact: true })
    .fill('Synthetic review note: recruiter contacted.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Synthetic review note: recruiter contacted.')).toBeVisible();
  await page.getByLabel('Action', { exact: true }).fill('Send follow-up');
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-10T12:00');
  await page.getByRole('button', { name: 'Add next action' }).click();
  await expect(page.getByText('Send follow-up', { exact: true })).toBeVisible();
  await page.getByLabel('Scheduled date').fill('2026-10-12T14:00');
  await page.getByRole('button', { name: 'Schedule interview' }).click();
  await expect(page.getByText('Recruiter interview scheduled', { exact: true })).toBeVisible();
  await page.getByLabel('Outcome').fill('Proceed to technical interview');
  await page.getByRole('button', { name: 'Save outcome' }).click();
  await expect(page.getByText('Interview Completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Draft → Applied', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: resumeName })).toBeVisible();
  await page.screenshot({ path: 'test-results/phase1-application.png', fullPage: true });
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await page.getByLabel('Search applications').fill(name);
  await page.getByLabel('Filter status').selectOption('applied');
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('jobhunt-applications.csv');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'test-results/phase1-overview.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/phase1-mobile.png', fullPage: true });
});



