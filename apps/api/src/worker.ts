import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Database } from './database';
import { CrmService } from './crm.service';
import { ResumeService } from './resume.service';
import { OperationsService } from './operations.service';
import { DiscoveryService } from './discovery.service';
import { settings } from './config';
import { aiStatus, OperationError } from './ai.provider';

const workerId = randomUUID(),
  db = new Database(),
  resumes = new ResumeService(db, new CrmService(db)),
  operations = new OperationsService(db, resumes),
  discovery = new DiscoveryService(db);
const connection = {
  password: settings.REDIS_PASSWORD,
  host: settings.REDIS_HOST,
  port: settings.REDIS_HOST === 'redis' ? 6379 : settings.REDIS_PORT,
  maxRetriesPerRequest: null,
};
const queue = new Queue('jobhunt-operations', {
  connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
});
const redis = new Redis({ ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on('error', () => {
  queueHealthy = false;
});
let queueHealthy = false,
  stopping = false,
  ticking = false,
  lastTick = 0;
const log = (event: string) =>
  console.log(JSON.stringify({ event, workerId, time: new Date().toISOString() }));
queue.on('error', () => {
  queueHealthy = false;
});
function isolated(kind: string, input: unknown): Promise<{ pdf?: string; analysis?: unknown }> {
  return new Promise((resolveResult, reject) => {
    const child = fork(resolve(__dirname, 'task-child.js'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: process.env,
    });
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
        reject(
          new OperationError(
            'TASK_TIMEOUT',
            'Isolated operation exceeded its execution deadline.',
            true,
          ),
        );
      },
      kind === 'pdf_publish' ? 12000 : 50000,
    );
    child.once(
      'message',
      (message: {
        ok: boolean;
        pdf?: string;
        analysis?: unknown;
        code: string;
        reason: string;
        retryable: boolean;
      }) => {
        clearTimeout(timer);
        if (message.ok) resolveResult(message);
        else reject(new OperationError(message.code, message.reason, message.retryable));
      },
    );
    child.once('error', () => {
      clearTimeout(timer);
      reject(new OperationError('PROCESS_FAILED', 'Isolated task process could not start.', true));
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(
        new OperationError('PROCESS_FAILED', 'Isolated task process exited unexpectedly.', true),
      );
    });
    child.send({ kind, input });
  });
}
const worker = new Worker(
  'jobhunt-operations',
  async (job) => {
    const claim = await operations.claim(job.data.runId, job.data.generation, workerId);
    if (!claim) return;
    const { run, attempt } = claim;
    const timer = setInterval(() => {
      void operations.heartbeat(run.id, attempt.id).catch(() => log('attempt_heartbeat_failed'));
    }, 5000);
    try {
      if (run.kind === 'diagnostic') {
        const { scenario } = run.input as { scenario: string };
        if (scenario === 'slow') await new Promise((r) => setTimeout(r, 10000));
        if (scenario === 'permanent')
          throw new OperationError(
            'DIAGNOSTIC_PERMANENT',
            'Synthetic permanent failure; automatic retry is disabled.',
          );
        if (
          (scenario === 'transient' && attempt.number === 1) ||
          (scenario === 'exhausted' && attempt.number <= 3)
        )
          throw new OperationError(
            'DIAGNOSTIC_TRANSIENT',
            'Synthetic transient failure; inspect attempt history and retry.',
            true,
          );
        await operations.finish(run.id, attempt.id, {
          message: 'Synthetic worker diagnostic completed.',
        });
      } else if (run.kind === 'source_import') {
        await discovery.execute(run.id, attempt.id);
      } else if (run.kind === 'pdf_publish') {
        const input = run.input as { draftId: string; revision: number; approved: true };
        const draft = await resumes.draft(run.ownerId, input.draftId);
        if (draft.revision !== input.revision)
          throw new OperationError(
            'STALE_INPUT',
            'Draft changed while the export was queued. Review and publish again.',
          );
        const result = await isolated(run.kind, {
          profile: draft.profileSnapshot,
          content: draft.content,
        });
        await resumes.publish(
          run.ownerId,
          input.draftId,
          { revision: input.revision, approved: true },
          {
            runId: run.id,
            attemptId: attempt.id,
            buffer: Buffer.from(result.pdf!, 'base64'),
          },
        );
      } else if (run.kind === 'ai_analysis') {
        const input = run.input as { draftId: string; revision: number; profileRevision: number };
        const [draft, profile] = await Promise.all([
          resumes.draft(run.ownerId, input.draftId),
          resumes.profile(run.ownerId),
        ]);
        if (draft.revision !== input.revision || profile?.revision !== input.profileRevision)
          throw new OperationError(
            'STALE_INPUT',
            'Profile or draft changed before analysis. Review the current draft.',
          );
        const result = await isolated(run.kind, run.input);
        await operations.finish(run.id, attempt.id, result.analysis as never);
      } else throw new OperationError('UNKNOWN_TASK', 'Unknown operation kind.');
    } catch (error) {
      const safe =
        error instanceof OperationError
          ? error
          : error instanceof HttpException && error.getStatus() === 400
            ? new OperationError(
                'INVALID_INPUT',
                'Document validation failed. Review the saved draft.',
              )
            : error instanceof Error && /changed|lease/.test(error.message)
              ? new OperationError(
                  'STALE_INPUT',
                  'Profile, draft or operation lease changed; review the current draft.',
                )
              : new OperationError(
                  'EXECUTION_FAILED',
                  'Execution failed. Check worker service health and retry.',
                  true,
                );
      await operations.fail(run.id, attempt.id, safe);
    } finally {
      clearInterval(timer);
    }
  },
  { connection, concurrency: 2, lockDuration: 30000, stalledInterval: 10000, maxStalledCount: 2 },
);
worker.on('error', () => log('queue_connection_failed'));
async function tick() {
  if (ticking || stopping) return;
  ticking = true;
  try {
    await operations.recover();
    await discovery.schedule();
    queueHealthy = (await redis.ping()) === 'PONG';
    const pending = await db.operationRun.findMany({
      where: { status: { in: ['queued', 'retrying'] }, nextAttemptAt: { lte: new Date() } },
      take: 100,
      orderBy: { nextAttemptAt: 'asc' },
    });
    for (const run of pending) {
      const jobId = `${run.id}-${run.generation}`;
      const old = await queue.getJob(jobId);
      if (old && ['completed', 'failed'].includes(await old.getState())) await old.remove();
      await queue.add(
        run.kind,
        { runId: run.id, generation: run.generation },
        { jobId, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
      );
      await db.operationRun.updateMany({
        where: { id: run.id, generation: run.generation, status: { in: ['queued', 'retrying'] } },
        data: { dispatchedAt: new Date() },
      });
    }
  } catch {
    queueHealthy = false;
    log('dispatch_degraded');
  } finally {
    try {
      await db.workerHeartbeat.upsert({
        where: { id: workerId },
        create: { id: workerId, queueHealthy, aiStatus: aiStatus() },
        update: { heartbeatAt: new Date(), queueHealthy, aiStatus: aiStatus() },
      });
      lastTick = Date.now();
    } catch {
      log('worker_heartbeat_failed');
    }
    ticking = false;
  }
}
const interval = setInterval(() => void tick(), 2000);
const server = createServer((_req, res) => {
  const ready = queueHealthy && lastTick > Date.now() - 20000;
  res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: ready ? 'healthy' : 'degraded', workerId, ai: aiStatus() }));
});
server.listen(settings.WORKER_HEALTH_PORT, process.env.WORKER_BIND_HOST ?? '127.0.0.1');
void tick();
log('worker_started');
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  server.close();
  await worker.close();
  await queue.close();
  redis.disconnect();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
