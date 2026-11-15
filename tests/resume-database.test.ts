import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from '../apps/api/src/database';
import { CrmService } from '../apps/api/src/crm.service';
import { ResumeService } from '../apps/api/src/resume.service';
import { storagePath } from '../apps/api/src/config';
import { profileSchema, contentSchema, requirementsSchema } from '../apps/api/src/resume.domain';
const db = new Database(),
  crm = new CrmService(db),
  resumes = new ResumeService(db, crm);
const owner = `resume-integration-${randomUUID()}`;
const factId = randomUUID();
let vacancyId: string,
  draftId: string,
  versionId: string,
  artifactId: string,
  appId: string,
  pdfHash: string;
const profile = profileSchema.parse({
  name: 'Alex Morgan',
  headline: 'Senior Frontend Engineer',
  email: 'alex@example.com',
  phone: '',
  location: 'Kyiv',
  website: '',
  facts: [
    {
      id: factId,
      kind: 'experience',
      title: 'Senior Frontend Engineer',
      context: 'Northstar Labs | 2020 - 2026',
      text: 'Built React and TypeScript interfaces.',
      approved: true,
    },
  ],
});
beforeAll(async () => {
  await db.$connect();
  const company = await crm.saveCompany(owner, { name: 'Northstar Labs' });
  const vacancy = await crm.saveVacancy(owner, {
    companyId: company.id,
    title: 'Senior Frontend Engineer',
    description: 'React and TypeScript experience required. Kubernetes preferred.',
  });
  vacancyId = vacancy.id;
  await resumes.saveProfile(owner, { revision: 0, content: profile });
  draftId = (await resumes.create(owner, { name: 'React role', vacancyId })).id;
});
afterAll(async () => {
  const artifacts = await db.resumeArtifact.findMany({ where: { ownerId: owner } });
  await db.$transaction(async (tx) => {
    const a = { application: { ownerId: owner } };
    await tx.applicationEvent.deleteMany({ where: a });
    await tx.application.deleteMany({ where: { ownerId: owner } });
    await tx.resumeDraft.updateMany({ where: { ownerId: owner }, data: { parentVersionId: null } });
    await tx.resumeVersion.updateMany({
      where: { ownerId: owner },
      data: { parentVersionId: null },
    });
    await tx.resumeVersion.deleteMany({ where: { ownerId: owner } });
    await tx.resumeDraft.deleteMany({ where: { ownerId: owner } });
    await tx.resumeArtifact.deleteMany({ where: { ownerId: owner } });
    await tx.candidateProfile.deleteMany({ where: { ownerId: owner } });
    await tx.vacancy.deleteMany({ where: { ownerId: owner } });
    await tx.company.deleteMany({ where: { ownerId: owner } });
  });
  for (const a of artifacts) await unlink(join(storagePath, a.storageKey)).catch(() => {});
  await db.$disconnect();
});
describe('Structured resume integrity in PostgreSQL', () => {
  it('scopes profile/draft access and rejects stale profile or draft revisions', async () => {
    expect(await resumes.profile('another-owner')).toBeNull();
    await expect(resumes.draft('another-owner', draftId)).rejects.toThrow('not found');
    await expect(resumes.saveProfile(owner, { revision: 0, content: profile })).rejects.toThrow(
      'Profile changed',
    );
    const d = await resumes.draft(owner, draftId);
    await expect(
      resumes.save(owner, draftId, {
        revision: 999,
        name: d.name,
        content: d.content,
        requirements: [],
      }),
    ).rejects.toThrow('draft changed');
  });
  it('rejects unsupported evidence and requires explicit publication approval', async () => {
    const d = await resumes.draft(owner, draftId);
    const content = contentSchema.parse(d.content);
    await expect(
      resumes.save(owner, draftId, {
        revision: d.revision,
        name: d.name,
        content: { ...content, blocks: [{ ...content.blocks[0], factId: randomUUID() }] },
        requirements: [],
      }),
    ).rejects.toThrow('approved profile fact');
    await expect(
      resumes.publish(owner, draftId, { revision: d.revision, approved: false }),
    ).rejects.toThrow();
    const requirements = [
      {
        id: randomUUID(),
        quote: 'Kubernetes preferred.',
        kind: 'preferred',
        state: 'unsupported',
        factIds: [],
      },
    ];
    const saved = await resumes.save(owner, draftId, {
      revision: d.revision,
      name: d.name,
      content: {
        ...content,
        blocks: [
          { ...content.blocks[0], text: 'Built accessible React and TypeScript interfaces.' },
        ],
      },
      requirements,
    });
    expect(requirementsSchema.parse(saved.requirements)[0].state).toBe('unsupported');
  });
  it('serializes concurrent publication and rolls back the losing artifact', async () => {
    const d = await resumes.draft(owner, draftId);
    const result = await Promise.allSettled([
      resumes.publish(owner, draftId, { revision: d.revision, approved: true }),
      resumes.publish(owner, draftId, { revision: d.revision, approved: true }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.resumeArtifact.count({ where: { ownerId: owner } })).toBe(1);
    const v = await db.resumeVersion.findFirstOrThrow({ where: { ownerId: owner } });
    versionId = v.id;
    artifactId = v.artifactId;
    const download = await crm.download(owner, artifactId);
    expect(download.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    pdfHash = createHash('sha256').update(download.buffer).digest('hex');
    expect(download.row.checksum).toBe(pdfHash);
    await expect(resumes.version('another-owner', versionId)).rejects.toThrow('not found');
    await expect(crm.download('another-owner', artifactId)).rejects.toThrow('not found');
  });
  it('pins the exact version to submission and preserves it across profile/vacancy/draft changes', async () => {
    const a = await crm.createApplication(owner, { vacancyId });
    appId = a.id;
    await crm.transition(owner, appId, {
      revision: 0,
      status: 'applied',
      submittedAt: new Date().toISOString(),
      resumeId: artifactId,
    });
    await crm.saveVacancy(
      owner,
      {
        companyId: a.vacancySnapshot && (await crm.vacancy(owner, vacancyId)).companyId,
        title: 'Changed role',
        description: 'Changed description',
      },
      vacancyId,
    );
    const d = await resumes.draft(owner, draftId);
    const content = contentSchema.parse(d.content);
    await resumes.save(owner, draftId, {
      revision: d.revision,
      name: 'Edited draft',
      content: { ...content, blocks: [{ ...content.blocks[0], text: 'Later draft wording.' }] },
      requirements: d.requirements,
    });
    await resumes.saveProfile(owner, {
      revision: 1,
      content: { ...profile, headline: 'Changed profile' },
    });
    const version = await resumes.version(owner, versionId);
    expect(contentSchema.parse(version.content).blocks[0].text).toBe(
      'Built accessible React and TypeScript interfaces.',
    );
    expect((version.vacancySnapshot as { description: string }).description).toContain(
      'Kubernetes',
    );
    expect((await crm.application(owner, appId)).resume?.version?.id).toBe(versionId);
    expect(
      createHash('sha256')
        .update((await crm.download(owner, artifactId)).buffer)
        .digest('hex'),
    ).toBe(pdfHash);
    const latest = await resumes.draft(owner, draftId);
    await expect(
      resumes.publish(owner, draftId, { revision: latest.revision, approved: true }),
    ).rejects.toThrow('Profile changed');
  });
  it('forks with lineage and rechecks facts against the current approved profile', async () => {
    const d = await resumes.fork(owner, versionId);
    expect(d.parentVersionId).toBe(versionId);
    await expect(
      db.resumeDraft.update({ where: { id: d.id }, data: { parentVersionId: randomUUID() } }),
    ).rejects.toThrow();
    expect(d.profileRevision).toBe(2);
    await resumes.saveProfile(owner, {
      revision: 2,
      content: { ...profile, facts: profile.facts.map((f) => ({ ...f, approved: false })) },
    });
    await expect(resumes.fork(owner, versionId)).rejects.toThrow('No unchanged approved facts');
    await expect(resumes.create(owner, { name: 'Invalid', vacancyId })).rejects.toThrow(
      'Approve at least one',
    );
    const exported = await crm.exportData(owner);
    expect(exported.schemaVersion).toBe(4);
    expect(exported.resumeVersions).toHaveLength(1);
    expect(exported.profile).not.toBeNull();
  });
});
