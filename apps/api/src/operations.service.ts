import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database';
import { ResumeService } from './resume.service';
import { parse } from './crm.service';
import { analysisInputSchema, analysisSchema, OperationError } from './ai.provider';
import { contentSchema, profileSchema, requirementsSchema, evidenceProblem } from './resume.domain';
import type { Prisma } from './generated/prisma/client';

export const LEASE_MS = 30000;
export const retryDelay = (attempt: number) => Math.min(30000, 2000 * 2 ** (attempt - 1));
@Injectable()
export class OperationsService {
  constructor(
    @Inject(Database) public readonly db: Database,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}
  async get(ownerId: string, id: string) {
    const row = await this.db.operationRun.findFirst({
      where: { id, ownerId },
      include: { attempts: { orderBy: { number: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Operation not found.');
    return row;
  }
  list(ownerId: string, targetId?: string) {
    if (targetId) parse(z.uuid(), targetId);
    return this.db.operationRun.findMany({
      where: { ownerId, ...(targetId ? { targetId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        kind: true,
        targetId: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
        createdAt: true,
        updatedAt: true,
        nextAttemptAt: true,
        errorCode: true,
        errorReason: true,
        retryable: true,
      },
    });
  }
  async create(
    ownerId: string,
    kind: string,
    targetId: string | null,
    key: string,
    input: Prisma.InputJsonValue,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId + '-' + key}))::text`;
      return (
        (await tx.operationRun.findUnique({
          where: { ownerId_requestKey: { ownerId, requestKey: key } },
        })) ??
        tx.operationRun.create({
          data: { ownerId, kind, targetId, requestKey: key, input, nextRequestedBy: ownerId },
        })
      );
    });
  }
  async publish(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z.object({ revision: z.number().int().nonnegative(), approved: z.literal(true) }).strict(),
      body,
    );
    const draft = await this.resumes.draft(ownerId, id);
    if (draft.revision !== data.revision)
      throw new ConflictException('Resume draft changed. Reload before retrying.');
    return this.create(ownerId, 'pdf_publish', id, `pdf-${id}-${data.revision}`, {
      draftId: id,
      ...data,
    });
  }
  async analyze(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z.object({ revision: z.number().int().nonnegative(), consent: z.literal(true) }).strict(),
      body,
    );
    if ((await this.health()).ai !== 'configured')
      throw new BadRequestException('AI is disabled or requires worker configuration.');
    const draft = await this.resumes.draft(ownerId, id),
      profile = await this.resumes.profile(ownerId);
    if (draft.revision !== data.revision || profile?.revision !== draft.profileRevision)
      throw new ConflictException('Profile or draft changed. Create or reload the draft.');
    const input = analysisInputSchema.parse({
      draftId: id,
      revision: draft.revision,
      profileRevision: draft.profileRevision,
      profile: draft.profileSnapshot,
      content: draft.content,
      vacancy: { description: (draft.vacancySnapshot as { description: string }).description },
    });
    return this.create(ownerId, 'ai_analysis', id, `ai-${id}-${data.revision}`, input);
  }
  diagnostic(ownerId: string, body: unknown) {
    const data = parse(
      z
        .object({ scenario: z.enum(['healthy', 'transient', 'exhausted', 'permanent', 'slow']) })
        .strict(),
      body,
    );
    return this.create(ownerId, 'diagnostic', null, randomUUID(), data);
  }
  async retry(ownerId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
      const run = await tx.operationRun.findFirst({ where: { id, ownerId } });
      if (!run) throw new NotFoundException('Operation not found.');
      if (run.status !== 'failed' || !run.retryable || run.maxAttempts >= 30)
        throw new ConflictException('Only eligible transient failures can be retried.');
      return tx.operationRun.update({
        where: { id },
        data: {
          status: 'retrying',
          generation: { increment: 1 },
          maxAttempts: { increment: 3 },
          nextTrigger: 'manual_retry',
          nextRequestedBy: ownerId,
          nextAttemptAt: new Date(),
          dispatchedAt: null,
          completedAt: null,
        },
      });
    });
  }
  async claim(id: string, generation: number, workerId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${id} FOR UPDATE`;
      const run = await tx.operationRun.findUnique({ where: { id } });
      if (
        !run ||
        !['queued', 'retrying'].includes(run.status) ||
        run.generation !== generation ||
        run.nextAttemptAt > new Date()
      )
        return null;
      const attempt = await tx.operationAttempt.create({
        data: {
          runId: id,
          number: run.attemptCount + 1,
          workerId,
          trigger: run.nextTrigger,
          requestedBy: run.nextRequestedBy,
        },
      });
      await tx.operationRun.update({
        where: { id },
        data: {
          status: 'running',
          attemptCount: { increment: 1 },
          activeAttemptId: attempt.id,
          leaseUntil: new Date(Date.now() + LEASE_MS),
        },
      });
      return { run, attempt };
    });
  }
  async heartbeat(id: string, attemptId: string) {
    const updated = await this.db.operationRun.updateMany({
      where: { id, status: 'running', activeAttemptId: attemptId, leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (updated.count)
      await this.db.operationAttempt.update({
        where: { id: attemptId },
        data: { heartbeatAt: new Date() },
      });
    return !!updated.count;
  }
  async finish(id: string, attemptId: string, output: Prisma.InputJsonValue) {
    return this.db.$transaction(async (tx) => {
      const changed = await tx.operationRun.updateMany({
        where: {
          id,
          status: 'running',
          activeAttemptId: attemptId,
          leaseUntil: { gt: new Date() },
        },
        data: {
          status: 'succeeded',
          output,
          leaseUntil: null,
          activeAttemptId: null,
          completedAt: new Date(),
          errorCode: null,
          errorReason: null,
          retryable: false,
        },
      });
      if (!changed.count) return false;
      await tx.operationAttempt.update({
        where: { id: attemptId },
        data: { status: 'succeeded', finishedAt: new Date() },
      });
      return true;
    });
  }
  async fail(id: string, attemptId: string, error: OperationError, expiredOnly = false) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${id} FOR UPDATE`;
      const run = await tx.operationRun.findUnique({ where: { id } });
      if (!run || run.status !== 'running' || run.activeAttemptId !== attemptId) return false;
      if (expiredOnly && run.leaseUntil && run.leaseUntil > new Date()) return false;
      const retry = error.retryable && run.attemptCount < run.maxAttempts;
      await tx.operationAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorCode: error.code,
          errorReason: error.message,
          retryable: error.retryable,
        },
      });
      await tx.operationRun.update({
        where: { id },
        data: {
          status: retry ? 'retrying' : 'failed',
          generation: { increment: 1 },
          activeAttemptId: null,
          leaseUntil: null,
          dispatchedAt: null,
          errorCode: error.code,
          errorReason: error.message,
          retryable: error.retryable,
          nextAttemptAt: new Date(
            Date.now() + Math.max(retryDelay(run.attemptCount), error.retryAfterMs ?? 0),
          ),
          nextTrigger: expiredOnly ? 'recovery' : 'automatic_retry',
          nextRequestedBy: 'system',
          completedAt: retry ? null : new Date(),
        },
      });
      return true;
    });
  }
  async recover() {
    const expired = await this.db.operationRun.findMany({
      where: { status: 'running', leaseUntil: { lt: new Date() } },
      take: 100,
    });
    for (const run of expired)
      if (run.activeAttemptId)
        await this.fail(
          run.id,
          run.activeAttemptId,
          new OperationError(
            'WORKER_INTERRUPTED',
            'Worker lease expired; the interrupted attempt was preserved.',
            true,
          ),
          true,
        );
  }
  async health() {
    const worker = await this.db.workerHeartbeat.findFirst({ orderBy: { heartbeatAt: 'desc' } });
    const fresh = !!worker && worker.heartbeatAt.getTime() > Date.now() - 20000;
    return {
      worker: fresh ? 'healthy' : 'unavailable',
      redis: fresh && worker.queueHealthy ? 'healthy' : 'unavailable',
      ai: fresh ? worker.aiStatus : 'worker_unavailable',
      workerInstance: worker?.id ?? null,
      workerStartedAt: worker?.startedAt ?? null,
      workerHeartbeatAt: worker?.heartbeatAt ?? null,
    };
  }
  async adoptRequirements(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z.object({ revision: z.number().int().nonnegative(), reviewed: z.literal(true) }).strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))::text`;
      await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
      const run = await tx.operationRun.findFirst({
        where: { id, ownerId, status: 'succeeded', kind: 'ai_analysis' },
      });
      if (!run) throw new NotFoundException('Completed analysis not found.');
      const input = analysisInputSchema.parse(run.input),
        output = analysisSchema.parse(run.output);
      const decisions = run.decisions as Record<string, unknown>;
      if (decisions.requirements) throw new ConflictException('Requirements already reviewed.');
      await tx.$queryRaw`SELECT id FROM "ResumeDraft" WHERE id=${input.draftId} AND "ownerId"=${ownerId} FOR UPDATE`;
      const draft = await tx.resumeDraft.findFirst({ where: { id: input.draftId, ownerId } }),
        profile = await tx.candidateProfile.findUnique({ where: { ownerId } });
      if (!draft || draft.revision !== data.revision || profile?.revision !== input.profileRevision)
        throw new ConflictException('Profile or draft changed. Create or reload the draft.');
      const requirements = requirementsSchema.parse([
        ...requirementsSchema.parse(draft.requirements),
        ...output.requirements,
      ]);
      if (
        evidenceProblem(
          profileSchema.parse(draft.profileSnapshot),
          contentSchema.parse(draft.content),
          requirements,
          input.vacancy.description,
        )
      )
        throw new BadRequestException('Analysis evidence is no longer valid.');
      await tx.resumeDraft.update({
        where: { id: draft.id },
        data: { requirements, revision: { increment: 1 } },
      });
      await tx.operationRun.update({
        where: { id },
        data: {
          decisions: {
            ...decisions,
            requirements: { decision: 'accepted', at: new Date().toISOString() },
          } as Prisma.InputJsonValue,
        },
      });
      return { ok: true };
    });
  }
  async decide(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z
        .object({
          revision: z.number().int().nonnegative(),
          suggestionId: z.uuid(),
          decision: z.enum(['accepted', 'rejected']),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))::text`;
      await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
      const run = await tx.operationRun.findFirst({
        where: { id, ownerId, status: 'succeeded', kind: 'ai_analysis' },
      });
      if (!run) throw new NotFoundException('Completed analysis not found.');
      const input = analysisInputSchema.parse(run.input),
        output = analysisSchema.parse(run.output);
      const suggestion = output.suggestions.find((s) => s.id === data.suggestionId);
      if (!suggestion) throw new NotFoundException('Suggestion not found.');
      const decisions = run.decisions as Record<string, { decision: string; at: string }>;
      if (decisions[suggestion.id]) throw new ConflictException('Suggestion already reviewed.');
      await tx.$queryRaw`SELECT id FROM "ResumeDraft" WHERE id=${input.draftId} AND "ownerId"=${ownerId} FOR UPDATE`;
      const draft = await tx.resumeDraft.findFirst({ where: { id: input.draftId, ownerId } });
      if (!draft || draft.revision !== data.revision)
        throw new ConflictException('Resume draft changed. Reload before retrying.');
      if (data.decision === 'accepted') {
        const profile = await tx.candidateProfile.findUnique({ where: { ownerId } });
        if (
          profile?.revision !== input.profileRevision ||
          draft.profileRevision !== input.profileRevision
        )
          throw new ConflictException(
            'Profile changed. Create a new draft from the updated profile.',
          );
        const content = contentSchema.parse(draft.content);
        const block = content.blocks.find((b) => b.factId === suggestion.factId);
        if (!block || block.text !== suggestion.before)
          throw new ConflictException('Suggestion source changed. Run a new analysis.');
        const approved = profileSchema
          .parse(draft.profileSnapshot)
          .facts.find((f) => f.id === block.factId && f.approved);
        if (!approved) throw new ConflictException('Suggestion source is no longer approved.');
        block.text = suggestion.after;
        await tx.resumeDraft.update({
          where: { id: draft.id },
          data: { content: contentSchema.parse(content), revision: { increment: 1 } },
        });
      }
      await tx.operationRun.update({
        where: { id },
        data: {
          decisions: {
            ...decisions,
            [suggestion.id]: { decision: data.decision, at: new Date().toISOString() },
          },
        },
      });
      return { ok: true };
    });
  }
}
