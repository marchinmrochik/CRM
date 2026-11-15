import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from './database';
import { CrmService, parse } from './crm.service';
import { storagePath } from './config';
import {
  profileSchema,
  contentSchema,
  requirementsSchema,
  fromProfile,
  evidenceProblem,
  resumeDiff,
} from './resume.domain';
import { renderResume } from './resume.pdf';
const vacancySnapshotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  company: z.string(),
  description: z.string(),
  url: z.string(),
});
const revision = z.number().int().nonnegative();
@Injectable()
export class ResumeService {
  constructor(
    @Inject(Database) public readonly db: Database,
    @Inject(CrmService) private readonly crm: CrmService,
  ) {}
  async profile(ownerId: string) {
    return this.db.candidateProfile.findUnique({ where: { ownerId } });
  }
  async saveProfile(ownerId: string, body: unknown) {
    const data = parse(z.object({ revision, content: profileSchema }).strict(), body);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))::text`;
      const old = await tx.candidateProfile.findUnique({ where: { ownerId } });
      if ((old?.revision ?? 0) !== data.revision)
        throw new ConflictException('Profile changed. Reload before retrying.');
      return tx.candidateProfile.upsert({
        where: { ownerId },
        create: { ownerId, content: data.content, revision: 1 },
        update: { content: data.content, revision: { increment: 1 } },
      });
    });
  }
  async draft(ownerId: string, id: string) {
    const row = await this.db.resumeDraft.findFirst({
      where: { id, ownerId },
      include: {
        versions: {
          select: { id: true, number: true, name: true, artifactId: true, createdAt: true },
          orderBy: { number: 'desc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Resume draft not found.');
    return {
      ...row,
      diff: resumeDiff(parse(contentSchema, row.baseline), parse(contentSchema, row.content)),
    };
  }
  async list(ownerId: string) {
    return this.db.resumeDraft.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        revision: true,
        updatedAt: true,
        versions: {
          select: { id: true, number: true, artifactId: true },
          orderBy: { number: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  async create(ownerId: string, body: unknown) {
    const data = parse(
      z.object({ name: z.string().trim().min(1).max(160), vacancyId: z.uuid() }).strict(),
      body,
    );
    const [profile, vacancy] = await Promise.all([
      this.profile(ownerId),
      this.crm.vacancy(ownerId, data.vacancyId),
    ]);
    if (!profile) throw new BadRequestException('Save your profile before creating a resume.');
    const snapshot = parse(profileSchema, profile.content);
    const content = fromProfile(snapshot);
    if (!content.blocks.length)
      throw new BadRequestException('Approve at least one profile fact before creating a resume.');
    return this.db.resumeDraft.create({
      data: {
        ownerId,
        name: data.name,
        profileRevision: profile.revision,
        profileSnapshot: snapshot,
        vacancySnapshot: {
          id: vacancy.id,
          title: vacancy.title,
          company: vacancy.company.name,
          description: vacancy.description,
          url: vacancy.url ?? '',
        },
        content,
        baseline: content,
        requirements: [],
      },
    });
  }
  async save(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z
        .object({
          revision,
          name: z.string().trim().min(1).max(160),
          content: contentSchema,
          requirements: requirementsSchema,
        })
        .strict(),
      body,
    );
    const row = await this.draft(ownerId, id);
    const problem = evidenceProblem(
      parse(profileSchema, row.profileSnapshot),
      data.content,
      data.requirements,
      (row.vacancySnapshot as { description: string }).description,
    );
    if (problem) throw new BadRequestException(problem);
    const changed = await this.db.resumeDraft.updateMany({
      where: { id, ownerId, revision: data.revision },
      data: {
        name: data.name,
        content: data.content,
        requirements: data.requirements,
        revision: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new ConflictException('Resume draft changed. Reload before retrying.');
    return this.draft(ownerId, id);
  }
  async version(ownerId: string, id: string) {
    const row = await this.db.resumeVersion.findFirst({
      where: { id, ownerId },
      include: { artifact: { select: { id: true, name: true, size: true, checksum: true } } },
    });
    if (!row) throw new NotFoundException('Resume version not found.');
    return row;
  }
  async fork(ownerId: string, id: string) {
    const [version, profile] = await Promise.all([
      this.version(ownerId, id),
      this.profile(ownerId),
    ]);
    if (!profile) throw new BadRequestException('Save your profile before creating a resume.');
    const snapshot = parse(profileSchema, profile.content);
    const old = parse(contentSchema, version.content);
    // Reuse wording only for facts which are still approved and unchanged in the current profile.
    const original = parse(profileSchema, version.profileSnapshot);
    const approved = new Map(snapshot.facts.filter((f) => f.approved).map((f) => [f.id, f]));
    const blocks = old.blocks.filter((b) => {
      const now = approved.get(b.factId);
      const before = original.facts.find((f) => f.id === b.factId);
      return now && before && JSON.stringify(now) === JSON.stringify(before);
    });
    if (!blocks.length)
      throw new BadRequestException(
        'No unchanged approved facts remain. Create a new resume from your profile.',
      );
    const content = { ...old, blocks };
    const requirements = parse(requirementsSchema, version.requirements).map((r) => ({
      ...r,
      factIds: r.factIds.filter((id) => blocks.some((b) => b.factId === id)),
      state: r.factIds.some((id) => !blocks.some((b) => b.factId === id))
        ? ('needs_confirmation' as const)
        : r.state,
    }));
    return this.db.resumeDraft.create({
      data: {
        ownerId,
        name: version.name,
        profileRevision: profile.revision,
        profileSnapshot: snapshot,
        vacancySnapshot: parse(vacancySnapshotSchema, version.vacancySnapshot),
        content,
        baseline: old,
        requirements,
        parentVersionId: version.id,
      },
    });
  }
  async publish(
    ownerId: string,
    id: string,
    body: unknown,
    operation?: { runId: string; attemptId: string; buffer: Buffer },
  ) {
    const data = parse(z.object({ revision, approved: z.literal(true) }).strict(), body);
    const row = await this.draft(ownerId, id);
    if (row.revision !== data.revision)
      throw new ConflictException('Resume draft changed. Reload before retrying.');
    const profile = parse(profileSchema, row.profileSnapshot);
    const content = parse(contentSchema, row.content);
    const requirements = parse(requirementsSchema, row.requirements);
    const problem = evidenceProblem(
      profile,
      content,
      requirements,
      (row.vacancySnapshot as { description: string }).description,
    );
    if (problem) throw new BadRequestException(problem);
    const buffer = operation?.buffer ?? (await renderResume(profile, content));
    const storageKey = `${randomUUID()}.pdf`;
    await mkdir(storagePath, { recursive: true });
    await writeFile(join(storagePath, storageKey), buffer, { flag: 'wx' });
    try {
      return await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))::text`;
          if (operation) {
            await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${operation.runId} FOR UPDATE`;
            const run = await tx.operationRun.findFirst({
              where: {
                id: operation.runId,
                ownerId,
                status: 'running',
                activeAttemptId: operation.attemptId,
                leaseUntil: { gt: new Date() },
              },
            });
            if (!run) throw new ConflictException('Operation lease is no longer active.');
          }
          await tx.$queryRaw`SELECT id FROM "ResumeDraft" WHERE id=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
          const current = await tx.resumeDraft.findFirst({ where: { id, ownerId } });
          const liveProfile = await tx.candidateProfile.findUnique({ where: { ownerId } });
          if (!current || current.revision !== data.revision)
            throw new ConflictException('Resume draft changed. Reload before retrying.');
          if (!liveProfile || liveProfile.revision !== row.profileRevision)
            throw new ConflictException(
              'Profile changed. Create a new draft from the updated profile.',
            );
          const number = (await tx.resumeVersion.count({ where: { draftId: id } })) + 1;
          const artifact = await tx.resumeArtifact.create({
            data: {
              ownerId,
              name: `${row.name.replace(/[\r\n\\/]/g, '_')}-v${number}.pdf`,
              storageKey,
              size: buffer.length,
              checksum: createHash('sha256').update(buffer).digest('hex'),
            },
          });
          const version = await tx.resumeVersion.create({
            data: {
              ownerId,
              draftId: id,
              number,
              name: row.name,
              parentVersionId: row.parentVersionId,
              profileSnapshot: profile,
              vacancySnapshot: parse(vacancySnapshotSchema, row.vacancySnapshot),
              content,
              requirements,
              acceptedDiff: resumeDiff(parse(contentSchema, row.baseline), content),
              artifactId: artifact.id,
            },
          });
          await tx.resumeDraft.update({
            where: { id },
            data: { revision: { increment: 1 }, baseline: content, parentVersionId: version.id },
          });
          if (operation) {
            await tx.operationRun.update({
              where: { id: operation.runId },
              data: {
                status: 'succeeded',
                output: { versionId: version.id, artifactId: artifact.id },
                activeAttemptId: null,
                leaseUntil: null,
                completedAt: new Date(),
                errorCode: null,
                errorReason: null,
                retryable: false,
              },
            });
            await tx.operationAttempt.update({
              where: { id: operation.attemptId },
              data: { status: 'succeeded', finishedAt: new Date() },
            });
          }
          return version;
        },
        { timeout: 10000 },
      );
    } catch (error) {
      await unlink(join(storagePath, storageKey)).catch(() => {});
      throw error;
    }
  }
}
