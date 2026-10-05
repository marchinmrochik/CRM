import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/src/database';
import { CrmService } from '../apps/api/src/crm.service';
const db = new Database();
const crm = new CrmService(db);
const owner = `integration-${randomUUID()}`;
let companyId: string;
let vacancyId: string;
let applicationId: string;
beforeAll(async () => {
  await db.$connect();
  const company = await crm.saveCompany(owner, { name: 'Synthetic Integration Company' });
  companyId = company.id;
  const vacancy = await crm.saveVacancy(owner, {
    companyId,
    title: 'Senior React',
    description: 'Original description',
  });
  vacancyId = vacancy.id;
  const application = await crm.createApplication(owner, { vacancyId });
  applicationId = application.id;
});
afterAll(async () => {
  // Remove only fixtures with this run's unique owner identifier.
  await db.$transaction(async (tx) => {
    const applications = { application: { ownerId: owner } };
    await tx.applicationEvent.deleteMany({ where: applications });
    await tx.note.deleteMany({ where: applications });
    await tx.nextAction.deleteMany({ where: applications });
    await tx.interview.deleteMany({ where: applications });
    await tx.application.deleteMany({ where: { ownerId: owner } });
    await tx.vacancy.deleteMany({ where: { ownerId: owner } });
    await tx.company.deleteMany({ where: { ownerId: owner } });
  });
  await db.$disconnect();
});
describe('PostgreSQL integrity', () => {
  it('rejects cross-owner access and invalid foreign ownership', async () => {
    await expect(crm.application('another-owner', applicationId)).rejects.toThrow(
      'Application not found',
    );
    await expect(
      crm.saveVacancy('another-owner', { companyId, title: 'Role', description: 'Description' }),
    ).rejects.toThrow('Company not found');
  });
  it('preserves captured evidence when vacancy content changes', async () => {
    await crm.saveVacancy(
      owner,
      { companyId, title: 'Changed role', description: 'Edited description' },
      vacancyId,
    );
    const row = await crm.application(owner, applicationId);
    expect(row.vacancySnapshot).toMatchObject({
      title: 'Senior React',
      description: 'Original description',
    });
    expect(row.vacancy.description).toBe('Edited description');
  });
  it('rejects duplicate drafts unless explicitly confirmed', async () => {
    await expect(crm.createApplication(owner, { vacancyId })).rejects.toThrow('already exists');
  });
  it('atomically writes status and event; stale revisions cannot add events', async () => {
    await crm.transition(owner, applicationId, {
      status: 'applied',
      revision: 0,
      submittedAt: new Date().toISOString(),
      noResume: true,
    });
    await expect(
      crm.transition(owner, applicationId, { status: 'in_progress', revision: 0 }),
    ).rejects.toThrow('changed');
    const row = await crm.application(owner, applicationId);
    expect(row.status).toBe('applied');
    expect(row.revision).toBe(1);
    expect(row.events.filter((e) => e.type === 'status_changed')).toHaveLength(1);
  });
  it('supports bounded filtered pages and does not leak other owners', async () => {
    const result = await crm.list(owner, { status: 'applied', q: 'Changed' });
    expect(result.total).toBe(1);
    expect(result.pageSize).toBe(20);
    expect((await crm.list('another-owner', {})).total).toBe(0);
    await expect(crm.list(owner, { page: 0 })).rejects.toThrow();
  });
  it('rejects invalid PDFs before creating artifacts', async () => {
    await expect(
      crm.upload(owner, {
        mimetype: 'application/pdf',
        buffer: Buffer.from('not a PDF'),
      } as Express.Multer.File),
    ).rejects.toThrow('valid PDF header');
    expect(await db.resumeArtifact.count({ where: { ownerId: owner } })).toBe(0);
  });
});
