import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Database } from '../../apps/api/src/database';

test('discovery explains matches, preserves snapshots and promotes reviewed vacancies', async ({
  page,
}) => {
  const settings = parse(readFileSync('.env')),
    db = new Database(),
    externalId = `synthetic-review-${randomUUID()}`;
  const content = {
    externalId,
    title: 'Synthetic Review React Engineer',
    company: `Synthetic Discovery Review ${externalId.slice(-8)}`,
    description:
      'React and TypeScript required. Remote Europe. Eligibility needs confirmation.\n<script>This is plain text.</script>',
    url: 'https://remotive.com/remote-jobs/software-dev/synthetic-review',
    location: 'Europe',
    publishedAt: '2000-10-05T00:00:00.000Z',
  };
  let runId = '',
    sourceId = '',
    oldLastRunId: string | null = null;
  try {
    await page.goto('/');
    await page
      .getByLabel('Owner password')
      .fill(process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connected sources' })).toBeVisible();
    for (const name of ['Remotive', 'Arbeitnow', 'Jobicy', 'Himalayas', 'Remote OK'])
      await expect(
        page.locator('.discovery-sources').getByRole('heading', { name, exact: true }),
      ).toBeVisible();
    const source = await db.discoverySource.findUniqueOrThrow({
      where: { ownerId_connector: { ownerId: 'local-owner', connector: 'remotive' } },
    });
    sourceId = source.id;
    oldLastRunId = source.lastRunId;
    const run = await db.operationRun.create({
      data: {
        ownerId: 'local-owner',
        kind: 'source_import',
        targetId: source.id,
        requestKey: externalId,
        input: { connector: 'remotive' },
        status: 'failed',
        attemptCount: 1,
        maxAttempts: 1,
        errorCode: 'SOURCE_FORMAT',
        errorReason: 'Synthetic source outage for browser review.',
        completedAt: new Date(),
        attempts: {
          create: {
            number: 1,
            workerId: 'synthetic-browser-review',
            status: 'failed',
            errorCode: 'SOURCE_FORMAT',
            errorReason: 'Synthetic source outage for browser review.',
            finishedAt: new Date(),
          },
        },
      },
    });
    runId = run.id;
    await db.discoverySource.update({ where: { id: sourceId }, data: { lastRunId: runId } });
    await db.discoveryListing.create({
      data: {
        ...content,
        ownerId: 'local-owner',
        connector: 'remotive',
        contentHash: externalId,
        snapshots: {
          create: [
            {
              runId,
              content: { ...content, description: 'React required. Original description.' },
              capturedAt: new Date(Date.now() - 60000),
            },
            { runId, content },
          ],
        },
      },
    });
    await db.discoveryListing.create({
      data: {
        ...content,
        ownerId: 'local-owner',
        connector: 'arbeitnow',
        externalId,
        contentHash: externalId,
        url: 'https://www.arbeitnow.com/jobs/synthetic-review',
        snapshots: { create: { runId, content } },
      },
    });
    await page.reload();
    const card = page.locator('.discovery-sources .panel').filter({ hasText: 'Remotive' }).first();
    await expect(card).toContainText('SOURCE_FORMAT');
    await card.getByRole('button', { name: /Inspect import/ }).click();
    await expect(page.locator('.operation-detail')).toContainText('Synthetic source outage');
    await page.screenshot({ path: 'docs/reviews/phase-4/source-history.png', fullPage: true });
    await page.getByRole('button', { name: 'Job search', exact: true }).click();
    await page.getByLabel('Keywords (all words)').fill('Synthetic Review React TypeScript');
    await page.getByLabel('Company name', { exact: true }).fill('definitely-not-this-fixture');
    await expect(page.getByRole('heading', { name: 'No matching opportunities' })).toBeVisible();
    await page.getByLabel('Company name', { exact: true }).fill(content.company);
    await page.getByLabel('Published within').selectOption('7');
    await expect(page.getByRole('heading', { name: 'No matching opportunities' })).toBeVisible();
    await page.getByLabel('Published within').selectOption('');
    await page.locator('.saved-search-settings summary').click();
    await page.getByLabel('Search name').fill('Synthetic React review');
    await page.getByRole('button', { name: 'Save search', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Synthetic React review', exact: true }),
    ).toBeVisible();
    await page.getByLabel('Source', { exact: true }).selectOption('remotive');
    const row = page
      .locator('.discovery-row')
      .filter({ hasText: 'Synthetic Review React Engineer' });
    await expect(row).toContainText('Keyword match: react');
    await expect(row).toContainText('Possible duplicates: 1');
    await row.click();
    await page.reload();
    await expect(page.getByLabel('Keywords (all words)')).toHaveValue(
      'Synthetic Review React TypeScript',
    );
    await expect(page.locator('.discovery-detail')).toContainText(
      'Synthetic Review React Engineer',
    );
    const detail = page.locator('.discovery-detail');
    await expect(detail).toContainText('Eligibility unknown');
    await expect(detail.locator('.discovery-description')).toContainText(
      '<script>This is plain text.</script>',
    );
    await expect(detail.locator('.discovery-description script')).toHaveCount(0);
    await detail.getByLabel('Source snapshot').selectOption({ index: 2 });
    await expect(detail.locator('.discovery-description')).toHaveText(
      'React required. Original description.',
    );
    await detail.getByLabel('Source snapshot').selectOption('');
    await detail.getByRole('button', { name: 'Shortlist', exact: true }).click();
    await expect(row.locator('.badge')).toHaveText('Shortlisted');
    await page.screenshot({ path: 'docs/reviews/phase-4/discovery.png', fullPage: true });
    await page.getByTestId('language-switch').selectOption('ru');
    await expect(page.getByRole('heading', { name: 'Вакансии из источников' })).toBeVisible();
    await page.getByTestId('language-switch').selectOption('uk');
    await expect(page.getByRole('heading', { name: 'Вакансії з джерел' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: 'docs/reviews/phase-4/mobile.png', fullPage: true });
    await page.getByTestId('language-switch').selectOption('en');
    await detail.getByRole('button', { name: 'Save to CRM' }).click();
    const vacancy = page.locator('.vacancy-card').filter({ hasText: content.company }).first();
    await expect(vacancy).toContainText('Synthetic Review React Engineer');
    await vacancy.getByRole('button', { name: 'Prepare application' }).click();
    await expect(
      page.getByRole('heading', { name: 'Synthetic Review React Engineer', level: 2 }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Create tailored resume', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Target vacancy')).not.toHaveValue('');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Back to application', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Activity timeline' })).toBeVisible();
  } finally {
    if (sourceId)
      await db.discoverySource.update({
        where: { id: sourceId },
        data: { lastRunId: oldLastRunId },
      });
    await db.discoveryListing.deleteMany({ where: { ownerId: 'local-owner', externalId } });
    await db.savedSearch.deleteMany({
      where: { ownerId: 'local-owner', name: 'Synthetic React review' },
    });
    if (runId) await db.operationRun.delete({ where: { id: runId } });
    await db.$disconnect();
  }
});
