import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Database } from './database';
import { companyInput, vacancyInput, transitionInput, transitionProblem } from './domain';
import { storagePath } from './config';

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION',
      message: 'Check the highlighted fields.',
      fields: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  return result.data;
}

@Injectable()
export class CrmService {
  constructor(@Inject(Database) public readonly db: Database) {}
  async company(ownerId: string, id: string) {
    const row = await this.db.company.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('Company not found.');
    return row;
  }
  async vacancy(ownerId: string, id: string) {
    const row = await this.db.vacancy.findFirst({
      where: { id, ownerId },
      include: { company: true },
    });
    if (!row) throw new NotFoundException('Vacancy not found.');
    return row;
  }
  async application(ownerId: string, id: string) {
    const row = await this.db.application.findFirst({
      where: { id, ownerId },
      include: {
        vacancy: { include: { company: true } },
        resume: { select: { id: true, name: true, size: true } },
        events: { orderBy: { occurredAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        actions: { orderBy: { dueAt: 'asc' } },
        interviews: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Application not found.');
    return row;
  }
  async saveCompany(ownerId: string, body: unknown, id?: string) {
    const data = parse(companyInput, body);
    if (id) {
      await this.company(ownerId, id);
      return this.db.company.update({ where: { id }, data });
    }
    return this.db.company.create({ data: { ...data, ownerId } });
  }
  async saveVacancy(ownerId: string, body: unknown, id?: string) {
    const data = parse(vacancyInput, body);
    const company = await this.company(ownerId, data.companyId);
    if (company.archived)
      throw new BadRequestException('Cannot add a vacancy to an archived company.');
    if (id) {
      await this.vacancy(ownerId, id);
      return this.db.vacancy.update({ where: { id }, data });
    }
    return this.db.vacancy.create({ data: { ...data, ownerId } });
  }
  async createApplication(ownerId: string, body: unknown) {
    const data = parse(
      z.object({ vacancyId: z.uuid(), allowRepeat: z.boolean().default(false) }),
      body,
    );
    const vacancy = await this.vacancy(ownerId, data.vacancyId);
    return this.db.$transaction(async (tx) => {
      // Lock the parent to serialize duplicate submission checks for the same vacancy.
      await tx.$queryRaw`SELECT id FROM "Vacancy" WHERE id = ${vacancy.id} FOR UPDATE`;
      if (
        !data.allowRepeat &&
        (await tx.application.count({ where: { ownerId, vacancyId: vacancy.id } }))
      )
        throw new ConflictException(
          'An application already exists. Confirm creating a separate application.',
        );
      return tx.application.create({
        data: {
          ownerId,
          vacancyId: vacancy.id,
          vacancySnapshot: {
            title: vacancy.title,
            company: vacancy.company.name,
            description: vacancy.description,
            url: vacancy.url,
            source: vacancy.source,
            location: vacancy.location,
            eligibility: vacancy.eligibility,
          },
          events: {
            create: {
              type: 'created',
              label: 'Application draft created',
              actor: ownerId,
              metadata: {},
            },
          },
        },
      });
    });
  }
  async transition(ownerId: string, id: string, body: unknown) {
    const data = parse(transitionInput, body);
    return this.db.$transaction(async (tx) => {
      const row = await tx.application.findFirst({ where: { id, ownerId } });
      if (!row) throw new NotFoundException('Application not found.');
      const problem = transitionProblem(row.status, data.status, !!row.submittedAt, data.reopen);
      if (problem) throw new BadRequestException(problem);
      let submittedAt = row.submittedAt;
      if (data.status === 'applied' && !submittedAt) {
        if (!data.submittedAt) throw new BadRequestException('Submission date is required.');
        submittedAt = new Date(data.submittedAt);
        if (submittedAt.getTime() > Date.now() + 60000)
          throw new BadRequestException('Submission cannot be in the future.');
        if (!!data.resumeId === data.noResume)
          throw new BadRequestException(
            'Choose an existing resume or explicitly confirm no resume.',
          );
        if (
          data.resumeId &&
          !(await tx.resumeArtifact.findFirst({ where: { id: data.resumeId, ownerId } }))
        )
          throw new NotFoundException('Resume not found.');
      }
      const changed = await tx.application.updateMany({
        where: { id, ownerId, revision: data.revision },
        data: {
          status: data.status,
          submittedAt,
          revision: { increment: 1 },
          ...(!row.submittedAt && data.status === 'applied'
            ? { resumeId: data.resumeId ?? null, noResume: data.noResume }
            : {}),
        },
      });
      if (!changed.count)
        throw new ConflictException('Application changed. Reload before retrying.');
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          type: 'status_changed',
          label: `${row.status} → ${data.status}`,
          actor: ownerId,
          occurredAt: !row.submittedAt && submittedAt ? submittedAt : new Date(),
          metadata: { from: row.status, to: data.status, reopened: data.reopen },
        },
      });
      return tx.application.findUniqueOrThrow({ where: { id } });
    });
  }
  async list(ownerId: string, query: Record<string, unknown>) {
    const filter = parse(
      z.object({
        q: z.string().max(200).default(''),
        status: z
          .enum([
            '',
            'draft',
            'applied',
            'in_progress',
            'offer_received',
            'accepted',
            'rejected',
            'withdrawn',
          ])
          .default(''),
        page: z.coerce.number().int().min(1).default(1),
      }),
      query,
    );
    const where = {
      ownerId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            vacancy: {
              OR: [
                { title: { contains: filter.q, mode: 'insensitive' as const } },
                { company: { name: { contains: filter.q, mode: 'insensitive' as const } } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.application.findMany({
        where,
        include: {
          vacancy: { include: { company: true } },
          actions: { where: { completedAt: null }, orderBy: { dueAt: 'asc' }, take: 1 },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (filter.page - 1) * 20,
        take: 20,
      }),
      this.db.application.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: 20 };
  }
  async addNote(ownerId: string, id: string, body: unknown) {
    await this.application(ownerId, id);
    const data = parse(z.object({ content: z.string().trim().min(1).max(10000) }), body);
    return this.db.$transaction(async (tx) => {
      const note = await tx.note.create({ data: { applicationId: id, ...data } });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          type: 'note_added',
          label: 'Note added',
          actor: ownerId,
          metadata: { noteId: note.id },
        },
      });
      return note;
    });
  }
  async addAction(ownerId: string, id: string, body: unknown) {
    await this.application(ownerId, id);
    const data = parse(
      z.object({ title: z.string().trim().min(1).max(300), dueAt: z.iso.datetime() }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const action = await tx.nextAction.create({
        data: { applicationId: id, title: data.title, dueAt: new Date(data.dueAt) },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          type: 'action_added',
          label: `Next action: ${data.title}`,
          actor: ownerId,
          metadata: { actionId: action.id },
        },
      });
      return action;
    });
  }
  async completeAction(ownerId: string, appId: string, id: string) {
    await this.application(ownerId, appId);
    return this.db.$transaction(async (tx) => {
      const changed = await tx.nextAction.updateMany({
        where: { id, applicationId: appId, completedAt: null },
        data: { completedAt: new Date() },
      });
      if (!changed.count) throw new ConflictException('Action missing or already completed.');
      await tx.applicationEvent.create({
        data: {
          applicationId: appId,
          type: 'action_completed',
          label: 'Next action completed',
          actor: ownerId,
          metadata: { actionId: id },
        },
      });
      return { ok: true };
    });
  }
  async addInterview(ownerId: string, id: string, body: unknown) {
    await this.application(ownerId, id);
    const data = parse(
      z.object({
        type: z.enum(['recruiter', 'technical', 'final', 'other']),
        scheduledAt: z.iso.datetime(),
        timezone: z
          .string()
          .max(100)
          .refine((value) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }, 'Invalid timezone'),
      }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: { applicationId: id, ...data, scheduledAt: new Date(data.scheduledAt) },
      });
      await tx.applicationEvent.create({
        data: {
          applicationId: id,
          type: 'interview_scheduled',
          label: `${data.type} interview scheduled`,
          actor: ownerId,
          metadata: { interviewId: interview.id, scheduledAt: data.scheduledAt },
        },
      });
      return interview;
    });
  }
  async updateInterview(ownerId: string, appId: string, id: string, body: unknown) {
    await this.application(ownerId, appId);
    const data = parse(
      z.object({
        status: z.enum(['completed', 'cancelled']),
        outcome: z.string().trim().max(2000).default(''),
      }),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const changed = await tx.interview.updateMany({
        where: { id, applicationId: appId, status: 'scheduled' },
        data,
      });
      if (!changed.count) throw new ConflictException('Interview missing or already resolved.');
      await tx.applicationEvent.create({
        data: {
          applicationId: appId,
          type: `interview_${data.status}`,
          label: `Interview ${data.status}`,
          actor: ownerId,
          metadata: { interviewId: id, outcome: data.outcome },
        },
      });
      return { ok: true };
    });
  }
  async upload(ownerId: string, file?: Express.Multer.File) {
    if (
      !file ||
      file.mimetype !== 'application/pdf' ||
      file.buffer.subarray(0, 5).toString() !== '%PDF-'
    )
      throw new BadRequestException('Upload a PDF resume with a valid PDF header (maximum 5 MB).');
    const storageKey = `${randomUUID()}.pdf`;
    await mkdir(storagePath, { recursive: true });
    await writeFile(join(storagePath, storageKey), file.buffer, { flag: 'wx' });
    try {
      return await this.db.resumeArtifact.create({
        data: {
          ownerId,
          storageKey,
          name: file.originalname.replace(/[\r\n\\/]/g, '_').slice(0, 200),
          size: file.size,
          checksum: createHash('sha256').update(file.buffer).digest('hex'),
        },
        select: { id: true, name: true, size: true, createdAt: true },
      });
    } catch (error) {
      await unlink(join(storagePath, storageKey));
      throw error;
    }
  }
  async download(ownerId: string, id: string) {
    const row = await this.db.resumeArtifact.findFirst({ where: { id, ownerId } });
    if (!row) throw new NotFoundException('Resume not found.');
    try {
      return { row, buffer: await readFile(join(storagePath, row.storageKey)) };
    } catch {
      throw new NotFoundException('Resume file unavailable. Restore artifacts from backup.');
    }
  }
  async exportData(ownerId: string) {
    return this.db.$transaction(
      async (tx) => ({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        companies: await tx.company.findMany({ where: { ownerId } }),
        vacancies: await tx.vacancy.findMany({ where: { ownerId } }),
        applications: await tx.application.findMany({
          where: { ownerId },
          include: { events: true, notes: true, actions: true, interviews: true },
        }),
        resumes: await tx.resumeArtifact.findMany({
          where: { ownerId },
          select: {
            id: true,
            name: true,
            storageKey: true,
            checksum: true,
            size: true,
            createdAt: true,
          },
        }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
