import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';

test('owner analytics records, corrects and exports evidence for an isolated submission cohort', async ({
  page,
}) => {
  const settings = parse(readFileSync('.env')),
    source = `Synthetic Analytics ${randomUUID().slice(0, 8)}`;
  await page.goto('/');
  await page
    .getByLabel('Owner password')
    .fill(process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const headers = {
    Origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
    'X-Jobhunt-Client': 'web',
  };
  const company = await (
    await page.request.post('/api/v1/companies', { headers, data: { name: source } })
  ).json();
  const vacancy = await (
    await page.request.post('/api/v1/vacancies', {
      headers,
      data: {
        companyId: company.id,
        title: 'Synthetic Analytics React Engineer',
        description: 'React required.',
        source,
      },
    })
  ).json();
  const app = await (
    await page.request.post('/api/v1/applications', { headers, data: { vacancyId: vacancy.id } })
  ).json();
  await page.request.post(`/api/v1/applications/${app.id}/transition`, {
    headers,
    data: {
      revision: 0,
      status: 'applied',
      submittedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      noResume: true,
    },
  });
  await page.goto(`/?view=applications&application=${app.id}`);
  const milestones = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Observed milestones', exact: true }) })
    .first();
  await milestones
    .getByLabel('Evidence note (optional)')
    .fill('Synthetic recruiter reply for portfolio review.');
  await milestones.getByRole('button', { name: 'Record milestone' }).click();
  await expect(milestones.locator('.note')).toHaveCount(1);
  await milestones.getByLabel('Milestone', { exact: true }).selectOption('human_interaction');
  await milestones.getByRole('button', { name: 'Record milestone' }).click();
  await expect(milestones.locator('.note')).toHaveCount(2);
  await milestones.getByLabel('Milestone', { exact: true }).selectOption('interview');
  await milestones.getByRole('button', { name: 'Record milestone' }).click();
  await expect(milestones.locator('.note')).toHaveCount(3);
  const response = milestones.locator('.note').filter({ hasText: 'Recruiter response' });
  await response.getByRole('button', { name: 'Correct milestone' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Correction reason')
    .fill('Synthetic correction: response happened earlier.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await response.getByRole('button', { name: 'Correct milestone' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Correction reason')
    .fill('Synthetic correction: response happened earlier.');
  await page.getByRole('button', { name: 'Confirm correction' }).click();
  await expect(milestones.locator('.note')).toHaveCount(2);
  await milestones.getByLabel('Milestone', { exact: true }).selectOption('recruiter_response');
  const actual = new Date(Date.now() - 3 * 86400000);
  actual.setMinutes(actual.getMinutes() - actual.getTimezoneOffset());
  await milestones.getByLabel('Actually occurred at').fill(actual.toISOString().slice(0, 16));
  await milestones.getByRole('button', { name: 'Record milestone' }).click();
  await expect(milestones.locator('.note')).toHaveCount(3);
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByLabel('Captured source').selectOption(source);
  const submitted = page.locator('.stat-card').filter({ hasText: /^Submitted/ });
  await expect(submitted.locator('strong')).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Source comparison' })).toBeVisible();
  const query = `source=${encodeURIComponent(source)}`;
  const live = await (await page.request.get(`/api/v1/analytics?${query}`)).json();
  const exported = await (await page.request.get(`/api/v1/analytics/export?${query}`)).json();
  expect(exported.stages).toEqual(live.stages);
  expect(exported.submitted).toBe(1);
  expect(exported.responseTime.sample).toBe(1);
  await page.getByLabel('Submitted from (UTC)').fill('2026-10-05');
  await page.getByLabel('Submitted through (UTC)').fill('2026-10-01');
  await expect(page.locator('.error[role="alert"]')).toContainText('End date');
  await page.getByRole('button', { name: 'Reset cohort' }).click();
  await page.getByLabel('Captured source').selectOption(source);
  await expect(submitted.locator('strong')).toHaveText('1');
  await page.getByTestId('language-switch').selectOption('ru');
  await expect(
    page.getByRole('heading', { name: 'Конверсия по подтверждённым этапам' }),
  ).toBeVisible();
  await page.getByTestId('language-switch').selectOption('uk');
  await expect(page.getByRole('heading', { name: 'Порівняння резюме' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/reviews/phase-5/owner-mobile.png', fullPage: true });
  expect((await page.request.get('/api/v1/export/json')).ok()).toBe(true);
});
