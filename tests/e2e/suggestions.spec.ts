import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Database } from '../../apps/api/src/database';
import { validateAnalysis, analysisInputSchema } from '../../apps/api/src/ai.provider';
const settings = parse(readFileSync('.env'));
test('validated test-only analysis requires individual approval and never publishes automatically', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Owner password')
    .fill(process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const profile = await (await page.request.get('/api/v1/profile')).json();
  test.skip(
    profile?.content?.name !== 'Alex Morgan',
    'Preserve a personal profile; this scenario uses only the synthetic Phase 2 fixture.',
  );
  const headers = {
    Origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
    'X-Jobhunt-Client': 'web',
  };
  const company = await (
    await page.request.post('/api/v1/companies', {
      headers,
      data: { name: `Synthetic AI Review ${Date.now()}` },
    })
  ).json();
  const vacancy = await (
    await page.request.post('/api/v1/vacancies', {
      headers,
      data: {
        companyId: company.id,
        title: 'Synthetic React role',
        description: 'React required.',
      },
    })
  ).json();
  const draft = await (
    await page.request.post('/api/v1/resume-drafts', {
      headers,
      data: { name: 'Synthetic AI review fixture', vacancyId: vacancy.id },
    })
  ).json();
  const input = analysisInputSchema.parse({
    draftId: draft.id,
    revision: draft.revision,
    profileRevision: draft.profileRevision,
    profile: draft.profileSnapshot,
    content: draft.content,
    vacancy: { description: 'React required.' },
  });
  const requirementId = randomUUID(),
    suggestionId = randomUUID(),
    rejectedId = randomUUID();
  const output = validateAnalysis(
    {
      requirements: [
        {
          id: requirementId,
          quote: 'React required.',
          kind: 'mandatory',
          state: 'supported',
          factIds: [input.content.blocks[1].factId],
        },
      ],
      suggestions: [
        {
          id: suggestionId,
          factId: input.content.blocks[0].factId,
          before: input.content.blocks[0].text,
          after: 'Frontend engineer building products with React and TypeScript.',
          reason: 'Synthetic test-only wording proposal.',
        },
        {
          id: rejectedId,
          factId: input.content.blocks[1].factId,
          before: input.content.blocks[1].text,
          after: 'React, TypeScript, Redux, accessibility, HTML and CSS.',
          reason: 'Synthetic test-only skill ordering.',
        },
      ],
    },
    input,
  );
  // Only this browser test writes a completed fixture; no mock provider exists in production configuration.
  const db = new Database();
  let runId: string;
  try {
    const run = await db.operationRun.create({
      data: {
        ownerId: 'local-owner',
        kind: 'ai_analysis',
        targetId: draft.id,
        requestKey: randomUUID(),
        status: 'succeeded',
        input,
        output,
        attemptCount: 1,
        completedAt: new Date(),
        attempts: {
          create: {
            number: 1,
            workerId: 'test-fixture',
            status: 'succeeded',
            finishedAt: new Date(),
          },
        },
      },
    });
    runId = run.id;
  } finally {
    await db.$disconnect();
  }
  await page.goto(`/?view=resumes&draft=${draft.id}`);
  await expect(page.getByRole('heading', { name: 'Extracted requirements' })).toBeVisible();
  const requirementsForm = page
    .getByRole('button', { name: 'Add reviewed requirements' })
    .locator('..');
  await requirementsForm.getByRole('checkbox').check();
  await requirementsForm.getByRole('button', { name: 'Add reviewed requirements' }).click();
  await expect(page.getByLabel('Exact vacancy quote')).toHaveValue('React required.');
  const acceptForm = page.getByRole('button', { name: 'Accept suggestion' }).first().locator('..');
  await acceptForm.getByRole('checkbox').check();
  await acceptForm.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(page.getByText('Suggestion accepted', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Resume wording').first()).toHaveValue(output.suggestions[0].after);
  await page.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(page.getByText('Suggestion rejected', { exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/v1/resume-drafts/${draft.id}`)).json();
  expect(saved.versions).toHaveLength(0);
  expect(saved.revision).toBe(2);
  const reviewed = await (await page.request.get(`/api/v1/operations/${runId}`)).json();
  expect(reviewed.decisions[suggestionId].decision).toBe('accepted');
  expect(reviewed.decisions[rejectedId].decision).toBe('rejected');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/reviews/phase-3/suggestions.png', fullPage: true });
});
