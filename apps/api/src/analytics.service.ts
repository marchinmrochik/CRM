import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { buildReport, milestoneKinds, type AnalyticsApplication } from '@jobhunt/analytics';
import { Database } from './database';
import { OperationsService } from './operations.service';
import { parse } from './crm.service';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s));
const filterSchema = z
  .object({
    from: z.union([day, z.literal('')]).optional(),
    to: z.union([day, z.literal('')]).optional(),
    source: z.string().max(100).optional(),
    resumeKey: z.string().max(150).optional(),
  })
  .strict();
const metadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  async report(ownerId: string, query: Record<string, unknown>) {
    const filters = parse(filterSchema, query);
    if (filters.from && filters.to && filters.from > filters.to)
      throw new BadRequestException('End date must not precede start date.');
    const asOf = new Date().toISOString();
    const data = await this.db.$transaction(
      async (tx) => {
        if ((await tx.application.count({ where: { ownerId } })) > 10000)
          throw new BadRequestException(
            'Analytics workspace limit exceeded (10,000 applications). Export data for an offline report.',
          );
        const applications = await tx.application.findMany({
          where: { ownerId },
          include: { events: true, interviews: true, resume: { include: { version: true } } },
        });
        const rows: AnalyticsApplication[] = applications.map((a) => {
          const snapshot = metadata(a.vacancySnapshot),
            version = a.resume?.version;
          return {
            id: a.id,
            title: String(snapshot.title ?? ''),
            company: String(snapshot.company ?? ''),
            source: String(snapshot.source || 'Unknown'),
            status: a.status,
            submittedAt: a.submittedAt?.toISOString() ?? null,
            resumeKey: a.resumeId ?? (a.noResume ? 'no-resume' : 'not-recorded'),
            resumeLabel: version
              ? `${version.name} · v${version.number}`
              : (a.resume?.name ?? (a.noResume ? 'No resume' : 'Not recorded')),
            resumeVersionId: version?.id ?? null,
            events: a.events.map((e) => ({
              id: e.id,
              type: e.type,
              occurredAt: e.occurredAt.toISOString(),
              metadata: metadata(e.metadata),
            })),
            interviews: a.interviews.map((i) => ({ id: i.id, type: i.type })),
          };
        });
        const createdAt = {
          ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
          lte: filters.to
            ? new Date(
                Math.min(
                  Date.parse(`${filters.to}T00:00:00.000Z`) + 86400000 - 1,
                  Date.parse(asOf),
                ),
              )
            : new Date(asOf),
        };
        const where = { ownerId, createdAt };
        const states = await tx.operationRun.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        });
        const failedAttempts = await tx.operationAttempt.count({
          where: { status: 'failed', run: where },
        });
        const recoveredRuns = await tx.operationRun.count({
          where: { ...where, status: 'succeeded', attempts: { some: { status: 'failed' } } },
        });
        const errorCodes = await tx.operationAttempt.groupBy({
          by: ['errorCode'],
          where: { status: 'failed', run: where },
          _count: { _all: true },
          orderBy: { _count: { errorCode: 'desc' } },
          take: 10,
        });
        return {
          ...buildReport(rows, filters, asOf),
          operations: {
            states: states.map((s) => ({ status: s.status, count: s._count._all })),
            failedAttempts,
            recoveredRuns,
            errorCodes: errorCodes.map((e) => ({ code: e.errorCode, count: e._count._all })),
          },
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20000 },
    );
    return { ...data, serviceHealth: await this.operations.health() };
  }
  async record(ownerId: string, applicationId: string, body: unknown) {
    const data = parse(
      z
        .object({
          revision: z.number().int().nonnegative(),
          kind: z.enum(milestoneKinds),
          occurredAt: z.iso.datetime(),
          note: z.string().trim().max(500).default(''),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} AND "ownerId"=${ownerId} FOR UPDATE`;
      const app = await tx.application.findFirst({
        where: { id: applicationId, ownerId },
        include: { events: true },
      });
      if (!app) throw new NotFoundException('Application not found.');
      if (app.revision !== data.revision)
        throw new ConflictException('Application changed. Reload before retrying.');
      const occurredAt = new Date(data.occurredAt);
      if (!app.submittedAt || occurredAt < app.submittedAt || occurredAt > new Date())
        throw new BadRequestException('Milestone must be after submission and no later than now.');
      const voided = new Set(
        app.events
          .filter((e) => e.type === 'milestone_voided')
          .map((e) => metadata(e.metadata).eventId),
      );
      if (
        app.events.some(
          (e) =>
            e.type === 'milestone_recorded' &&
            metadata(e.metadata).kind === data.kind &&
            !voided.has(e.id),
        )
      )
        throw new ConflictException(
          'This milestone is already recorded. Correct it before adding a replacement.',
        );
      await tx.application.update({
        where: { id: applicationId },
        data: { revision: { increment: 1 } },
      });
      return tx.applicationEvent.create({
        data: {
          applicationId,
          type: 'milestone_recorded',
          label: `Milestone: ${data.kind}`,
          occurredAt,
          actor: ownerId,
          metadata: { kind: data.kind, note: data.note },
        },
      });
    });
  }
  async void(ownerId: string, applicationId: string, eventId: string, body: unknown) {
    const data = parse(
      z
        .object({
          revision: z.number().int().nonnegative(),
          reason: z.string().trim().min(1).max(500),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} AND "ownerId"=${ownerId} FOR UPDATE`;
      const app = await tx.application.findFirst({
        where: { id: applicationId, ownerId },
        include: { events: true },
      });
      if (!app) throw new NotFoundException('Application not found.');
      if (app.revision !== data.revision)
        throw new ConflictException('Application changed. Reload before retrying.');
      if (
        !app.events.some((e) => e.id === eventId && e.type === 'milestone_recorded') ||
        app.events.some(
          (e) => e.type === 'milestone_voided' && metadata(e.metadata).eventId === eventId,
        )
      )
        throw new ConflictException('Milestone missing or already corrected.');
      await tx.application.update({
        where: { id: applicationId },
        data: { revision: { increment: 1 } },
      });
      return tx.applicationEvent.create({
        data: {
          applicationId,
          type: 'milestone_voided',
          label: 'Milestone corrected',
          actor: ownerId,
          metadata: { eventId, reason: data.reason },
        },
      });
    });
  }
}
