import { beforeAll, afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/src/database';
import { CrmService } from '../apps/api/src/crm.service';
import { ResumeService } from '../apps/api/src/resume.service';
import { OperationsService } from '../apps/api/src/operations.service';
import { AnalyticsService } from '../apps/api/src/analytics.service';
const db = new Database(),
  crm = new CrmService(db),
  analytics = new AnalyticsService(db, new OperationsService(db, new ResumeService(db, crm))),
  owner = `analytics-test-${randomUUID()}`;
let id: string;
beforeAll(async () => {
  const company = await crm.saveCompany(owner, { name: 'Synthetic Cohort Company' });
  const vacancy = await crm.saveVacancy(owner, {
    companyId: company.id,
    title: 'React role',
    description: 'React required',
    source: 'Captured provider',
  });
  id = (await crm.createApplication(owner, { vacancyId: vacancy.id })).id;
  await crm.transition(owner, id, {
    status: 'applied',
    revision: 0,
    submittedAt: new Date(Date.now() - 86400000).toISOString(),
    noResume: true,
  });
  await crm.saveVacancy(
    owner,
    {
      companyId: company.id,
      title: 'Changed title',
      description: 'Changed requirements',
      source: 'Changed provider',
    },
    vacancy.id,
  );
});
afterAll(async () => {
  await db.applicationEvent.deleteMany({ where: { application: { ownerId: owner } } });
  await db.application.deleteMany({ where: { ownerId: owner } });
  await db.vacancy.deleteMany({ where: { ownerId: owner } });
  await db.company.deleteMany({ where: { ownerId: owner } });
  await db.operationRun.deleteMany({ where: { ownerId: owner } });
  await db.$disconnect();
});
it('records and corrects evidence under optimistic revisions and owner boundaries', async () => {
  const at = new Date(Date.now() - 3600000).toISOString();
  const record = await analytics.record(owner, id, {
    revision: 1,
    kind: 'recruiter_response',
    occurredAt: at,
    note: 'Synthetic call',
  });
  await expect(
    analytics.record(owner, id, { revision: 1, kind: 'interview', occurredAt: at }),
  ).rejects.toThrow('changed');
  await expect(
    analytics.record('other-owner', id, { revision: 2, kind: 'interview', occurredAt: at }),
  ).rejects.toThrow('not found');
  await expect(
    analytics.record(owner, id, { revision: 2, kind: 'recruiter_response', occurredAt: at }),
  ).rejects.toThrow('already recorded');
  await expect(
    analytics.record(owner, id, {
      revision: 2,
      kind: 'interview',
      occurredAt: '2020-01-01T00:00:00.000Z',
    }),
  ).rejects.toThrow('after submission');
  const first = await analytics.report(owner, {});
  expect(first.stages[0].count).toBe(1);
  expect(first.sources[0].label).toBe('Captured provider');
  expect(first.resumes[0].key).toBe('no-resume');
  expect(first.applications[0].title).toBe('React role');
  await analytics.void(owner, id, record.id, { revision: 2, reason: 'Mistaken date' });
  const corrected = await analytics.report(owner, {});
  expect(corrected.stages[0].count).toBe(0);
  const exported = await crm.exportData(owner);
  expect(
    exported.applications[0].events.filter((e) => e.type.startsWith('milestone_')),
  ).toHaveLength(2);
  await expect(
    analytics.void(owner, id, record.id, { revision: 3, reason: 'Repeat' }),
  ).rejects.toThrow('already corrected');
  await analytics.record(owner, id, { revision: 3, kind: 'recruiter_response', occurredAt: at });
  expect((await analytics.report(owner, {})).stages[0].count).toBe(1);
  expect((await analytics.report('other-owner', {})).submitted).toBe(0);
});
it('validates real UTC days and ranges and exposes preserved operation failures', async () => {
  await expect(analytics.report(owner, { from: '2026-02-30' })).rejects.toThrow();
  await expect(analytics.report(owner, { from: '2026-10-05', to: '2026-10-01' })).rejects.toThrow(
    'End date',
  );
  await db.operationRun.create({
    data: {
      ownerId: owner,
      kind: 'diagnostic',
      requestKey: randomUUID(),
      input: {},
      status: 'succeeded',
      attempts: {
        create: {
          number: 1,
          workerId: 'fixture',
          status: 'failed',
          errorCode: 'SYNTHETIC_FAILURE',
        },
      },
    },
  });
  const report = await analytics.report(owner, {});
  expect(report.operations.failedAttempts).toBe(1);
  expect(report.operations.recoveredRuns).toBe(1);
});
