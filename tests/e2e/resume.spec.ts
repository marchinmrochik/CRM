import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { parse } from 'dotenv';
const settings = parse(readFileSync('.env'));
const headers = {
  Origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
  'X-Jobhunt-Client': 'web',
};
test('manual tailoring publishes immutable PDF evidence in three interface languages', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Owner password')
    .fill(process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const existing = await (await page.request.get('/api/v1/profile')).json();
  test.skip(
    !!existing && existing.content.name !== 'Alex Morgan',
    'Do not replace a personal profile with a synthetic browser fixture.',
  );
  const company = await (
    await page.request.post('/api/v1/companies', {
      headers,
      data: { name: `Northstar Review ${Date.now()}` },
    })
  ).json();
  const vacancy = await (
    await page.request.post('/api/v1/vacancies', {
      headers,
      data: {
        companyId: company.id,
        title: 'Senior React Engineer',
        description:
          'React and TypeScript experience required. Kubernetes preferred. Remote work from Europe.',
      },
    })
  ).json();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Professional headline').fill('Senior Frontend Engineer');
  await page.getByLabel('Email', { exact: true }).fill('alex.morgan@example.com');
  await page.getByLabel('Location / region').fill('Kyiv, Ukraine');
  const facts = [
    {
      kind: 'summary',
      title: 'Professional summary',
      context: '',
      text: 'Frontend engineer with experience building React and TypeScript products.',
    },
    {
      kind: 'skill',
      title: 'Technical skills',
      context: '',
      text: 'React, TypeScript, Redux, HTML, CSS, accessibility.',
    },
    {
      kind: 'experience',
      title: 'Senior Frontend Engineer',
      context: 'Northstar Labs | 2020 - 2026',
      text: 'Built accessible React and TypeScript interfaces. Improved application performance and collaborated with product designers.',
    },
    {
      kind: 'education',
      title: 'Computer Science',
      context: 'Example University | 2012 - 2016',
      text: 'Bachelor of Science in Computer Science.',
    },
  ];
  // Keep the synthetic profile deterministic on repeated local review runs.
  const oldCount = await page.getByLabel('Fact title', { exact: true }).count();
  for (let i = oldCount; i > 0; i--)
    await page.getByRole('button', { name: `Remove fact ${i}`, exact: true }).click();
  for (const f of facts) {
    await page.getByRole('button', { name: 'Add fact', exact: true }).click();
    const block = page.locator('.editor-block').last();
    await block.getByLabel('Fact category').selectOption(f.kind);
    await block.getByLabel('Fact title').fill(f.title);
    await block.getByLabel('Company, role and dates / context').fill(f.context);
    await block.getByLabel('Confirmed experience or achievement').fill(f.text);
    await block.getByLabel('I confirm this fact is accurate').check();
  }
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(
    page.getByText('Revision ' + ((existing?.revision ?? 0) + 1), { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resumes', exact: true }).click();
  await page.getByRole('button', { name: 'Create tailored resume', exact: true }).click();
  const name = `React tailoring ${Date.now()}`;
  await page.getByLabel('Resume name').fill(name);
  await page.getByLabel('Target vacancy').selectOption(vacancy.id);
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resume content', exact: true })).toBeVisible();
  const draftUrl = page.url();
  await page
    .getByLabel('Resume wording')
    .nth(2)
    .fill(
      'Built accessible React and TypeScript interfaces. Improved application performance through profiling and collaborated with product designers.',
    );
  await page.getByRole('button', { name: 'Add requirement', exact: true }).click();
  const requirement = page
    .locator('.editor-block')
    .filter({ has: page.getByLabel('Exact vacancy quote') })
    .first();
  await requirement
    .getByLabel('Exact vacancy quote')
    .fill('React and TypeScript experience required.');
  await requirement.getByLabel('Evidence status').selectOption('supported');
  await requirement.getByLabel('Senior Frontend Engineer', { exact: true }).check();
  await page.getByRole('button', { name: 'Add requirement', exact: true }).click();
  await page.getByLabel('Exact vacancy quote').last().fill('Kubernetes preferred.');
  await page.getByLabel('Evidence status').last().selectOption('unsupported');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review and publish' })).toBeEnabled();
  mkdirSync('docs/reviews/phase-2', { recursive: true });
  await page.screenshot({ path: 'docs/reviews/phase-2/editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Review and publish' }).click();
  await expect(page.locator('.diff-before')).toContainText(
    'Built accessible React and TypeScript interfaces. Improved application performance and collaborated with product designers.',
  );
  await expect(page.locator('.diff-after')).toContainText('through profiling');
  await expect(page.getByRole('dialog').getByText('Unsupported', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/reviews/phase-2/review.png' });
  await page
    .getByLabel('I reviewed every change and confirm the resume accurately reflects my experience.')
    .check();
  await page.getByRole('button', { name: 'Publish version and PDF' }).click();
  await expect(page.getByText('Immutable published version', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const versionUrl = page.url();
  const versionId = new URL(versionUrl).searchParams.get('version')!;
  const version = await (await page.request.get(`/api/v1/resume-versions/${versionId}`)).json();
  const pdf = await page.request.get(`/api/v1/resumes/${version.artifactId}/download`);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: '← Resume library' }).click();
  await expect(
    page.getByRole('heading', { name: version.artifact.name, exact: true }),
  ).toBeVisible();
  const app = await (
    await page.request.post('/api/v1/applications', { headers, data: { vacancyId: vacancy.id } })
  ).json();
  await page.goto(`/?view=applications&application=${app.id}`);
  await page.getByLabel('New status').selectOption('applied');
  await page.getByLabel('Resume actually sent').selectOption(version.artifactId);
  await page.getByRole('button', { name: 'Update status' }).click();
  await expect(page.getByRole('link', { name: 'Published version 1' })).toBeVisible();
  await page.goto(draftUrl);
  await page
    .getByLabel('Resume wording')
    .nth(2)
    .fill('New draft wording which must not replace the submitted PDF.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review and publish' })).toBeEnabled();
  expect(
    (
      await (await page.request.get(`/api/v1/resumes/${version.artifactId}/download`)).body()
    ).equals(await pdf.body()),
  ).toBe(true);
  await page.goto(versionUrl);
  await page.getByTestId('language-switch').selectOption('ru');
  await expect(page.getByText('Неизменяемая опубликованная версия', { exact: true })).toBeVisible();
  await page.getByTestId('language-switch').selectOption('uk');
  await expect(page.getByText('Незмінна опублікована версія', { exact: true })).toBeVisible();
  await expect(page.locator('.resume-paper')).toContainText('React and TypeScript');
  await page.screenshot({ path: 'docs/reviews/phase-2/version-ukrainian.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/reviews/phase-2/mobile-version.png', fullPage: true });
  await page.goto(draftUrl);
  await expect(page.getByRole('heading', { name: 'Содержание резюме' })).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Зміст резюме' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'docs/reviews/phase-2/mobile-editor.png', fullPage: true });
});
