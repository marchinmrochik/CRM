import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Database } from '../apps/api/src/database';
import { CrmService } from '../apps/api/src/crm.service';
import { ResumeService } from '../apps/api/src/resume.service';
import { OperationsService } from '../apps/api/src/operations.service';
import {
  analysisInputSchema,
  OperationError,
  validateAnalysis,
  OpenAiProvider,
} from '../apps/api/src/ai.provider';
import { profileSchema } from '../apps/api/src/resume.domain';
import { renderResume } from '../apps/api/src/resume.pdf';
import { storagePath } from '../apps/api/src/config';
const db = new Database(),
  resumes = new ResumeService(db, new CrmService(db)),
  ops = new OperationsService(db, resumes);
const owner = `operations-test-${randomUUID()}`,
  factId = randomUUID();
let draftId: string;
const profile = profileSchema.parse({
  name: 'Synthetic Candidate',
  headline: '',
  email: '',
  phone: '',
  location: '',
  website: '',
  facts: [
    {
      id: factId,
      kind: 'experience',
      title: 'Engineer',
      context: '',
      text: 'Built React interfaces.',
      approved: true,
    },
  ],
});
beforeAll(async () => {
  await db.$connect();
  const crm = new CrmService(db),
    company = await crm.saveCompany(owner, { name: 'Synthetic Operations Company' });
  const vacancy = await crm.saveVacancy(owner, {
    companyId: company.id,
    title: 'React Engineer',
    description: 'React required. Kubernetes preferred.',
  });
  await resumes.saveProfile(owner, { revision: 0, content: profile });
  draftId = (
    await resumes.create(owner, { vacancyId: vacancy.id, name: 'Synthetic operations resume' })
  ).id;
});
afterAll(async () => {
  const files = await db.resumeArtifact.findMany({ where: { ownerId: owner } });
  await db.operationRun.deleteMany({ where: { ownerId: owner } });
  await db.resumeDraft.updateMany({ where: { ownerId: owner }, data: { parentVersionId: null } });
  await db.resumeVersion.deleteMany({ where: { ownerId: owner } });
  await db.resumeDraft.deleteMany({ where: { ownerId: owner } });
  await db.resumeArtifact.deleteMany({ where: { ownerId: owner } });
  await db.candidateProfile.deleteMany({ where: { ownerId: owner } });
  await db.vacancy.deleteMany({ where: { ownerId: owner } });
  await db.company.deleteMany({ where: { ownerId: owner } });
  for (const file of files) await unlink(join(storagePath, file.storageKey)).catch(() => {});
  await db.$disconnect();
});
describe('Durable PostgreSQL operation ledger', () => {
  it('deduplicates publication requests, scopes owners and claims one attempt under concurrent delivery', async () => {
    const [a, b] = await Promise.all([
      ops.publish(owner, draftId, { revision: 0, approved: true }),
      ops.publish(owner, draftId, { revision: 0, approved: true }),
    ]);
    expect(a.id).toBe(b.id);
    await expect(ops.get('other-owner', a.id)).rejects.toThrow('not found');
    const claims = await Promise.all([
      ops.claim(a.id, 0, 'worker-a'),
      ops.claim(a.id, 0, 'worker-b'),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    const draft = await resumes.draft(owner, draftId),
      bytes = await renderResume(profile, draft.content as never);
    await resumes.publish(
      owner,
      draftId,
      { revision: 0, approved: true },
      { runId: a.id, attemptId: claim.attempt.id, buffer: bytes },
    );
    expect((await ops.get(owner, a.id)).status).toBe('succeeded');
    expect(await ops.claim(a.id, 0, 'duplicate')).toBeNull();
    expect(await db.resumeVersion.count({ where: { draftId } })).toBe(1);
  });
  it('preserves transient failures, backoff, manual retry and eventual success', async () => {
    const run = await ops.diagnostic(owner, { scenario: 'exhausted' });
    for (let number = 1; number <= 3; number++) {
      const current = await ops.get(owner, run.id),
        claim = await ops.claim(run.id, current.generation, 'test-worker');
      expect(claim).not.toBeNull();
      await ops.fail(
        run.id,
        claim!.attempt.id,
        new OperationError('TRANSIENT', 'Synthetic transient failure.', true),
      );
      await db.operationRun.update({ where: { id: run.id }, data: { nextAttemptAt: new Date(0) } });
    }
    const failed = await ops.get(owner, run.id);
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toHaveLength(3);
    const retry = await ops.retry(owner, run.id),
      claim = await ops.claim(run.id, retry.generation, 'new-worker');
    await ops.finish(run.id, claim!.attempt.id, { ok: true });
    const recovered = await ops.get(owner, run.id);
    expect(recovered.status).toBe('succeeded');
    expect(recovered.attempts.map((a) => a.status)).toEqual([
      'failed',
      'failed',
      'failed',
      'succeeded',
    ]);
    expect(recovered.attempts.map((a) => a.trigger)).toEqual([
      'initial',
      'automatic_retry',
      'automatic_retry',
      'manual_retry',
    ]);
  });
  it('fences expired leases and late results, then recovers interrupted work', async () => {
    const run = await ops.diagnostic(owner, { scenario: 'slow' }),
      claim = await ops.claim(run.id, 0, 'dead-worker');
    await db.operationRun.update({ where: { id: run.id }, data: { leaseUntil: new Date(0) } });
    expect(await ops.finish(run.id, claim!.attempt.id, { late: true })).toBe(false);
    await ops.recover();
    const interrupted = await ops.get(owner, run.id);
    expect(interrupted.errorCode).toBe('WORKER_INTERRUPTED');
    expect(interrupted.status).toBe('retrying');
    expect(await ops.heartbeat(run.id, claim!.attempt.id)).toBe(false);
    expect(await ops.finish(run.id, claim!.attempt.id, { late: true })).toBe(false);
    await db.operationRun.update({ where: { id: run.id }, data: { nextAttemptAt: new Date(0) } });
    const recovered = await ops.claim(run.id, interrupted.generation, 'new-worker');
    await ops.finish(run.id, recovered!.attempt.id, { ok: true });
    expect((await ops.get(owner, run.id)).attempts[0].errorCode).toBe('WORKER_INTERRUPTED');
    expect((await ops.get(owner, run.id)).attempts[1].trigger).toBe('recovery');
  });
  it('does not automatically or manually retry permanent failures', async () => {
    const run = await ops.diagnostic(owner, { scenario: 'permanent' }),
      claim = await ops.claim(run.id, 0, 'worker');
    await ops.fail(
      run.id,
      claim!.attempt.id,
      new OperationError('INVALID_OUTPUT', 'Invalid provider output.'),
    );
    expect((await ops.get(owner, run.id)).status).toBe('failed');
    await expect(ops.retry(owner, run.id)).rejects.toThrow('eligible');
  });
  it('requires explicit decisions and protects changed draft/profile evidence', async () => {
    const draft = await resumes.draft(owner, draftId);
    const input = analysisInputSchema.parse({
      draftId,
      revision: draft.revision,
      profileRevision: 1,
      profile: draft.profileSnapshot,
      content: draft.content,
      vacancy: { description: 'React required. Kubernetes preferred.' },
    });
    const suggestionId = randomUUID(),
      requirementId = randomUUID();
    const output = validateAnalysis(
      {
        requirements: [
          {
            id: requirementId,
            quote: 'React required.',
            kind: 'mandatory',
            state: 'supported',
            factIds: [factId],
          },
        ],
        suggestions: [
          {
            id: suggestionId,
            factId,
            before: 'Built React interfaces.',
            after: 'Developed interfaces using React.',
            reason: 'Clear wording.',
          },
        ],
      },
      input,
    );
    const run = await ops.create(owner, 'ai_analysis', draftId, randomUUID(), input),
      claim = await ops.claim(run.id, 0, 'fixture-provider');
    await ops.finish(run.id, claim!.attempt.id, output);
    await expect(
      ops.decide('other-owner', run.id, {
        revision: draft.revision,
        suggestionId,
        decision: 'accepted',
      }),
    ).rejects.toThrow('not found');
    await ops.decide(owner, run.id, {
      revision: draft.revision,
      suggestionId,
      decision: 'accepted',
    });
    let changed = await resumes.draft(owner, draftId);
    expect((changed.content as { blocks: { text: string }[] }).blocks[0].text).toBe(
      'Developed interfaces using React.',
    );
    await expect(
      ops.decide(owner, run.id, { revision: changed.revision, suggestionId, decision: 'accepted' }),
    ).rejects.toThrow('already');
    await ops.adoptRequirements(owner, run.id, { revision: changed.revision, reviewed: true });
    changed = await resumes.draft(owner, draftId);
    expect(changed.requirements).toHaveLength(1);
    expect((await db.resumeVersion.findFirst({ where: { draftId } }))!.content).toEqual(
      input.content,
    );
    const stale = await ops.create(owner, 'ai_analysis', draftId, randomUUID(), {
        ...input,
        revision: changed.revision,
      }),
      staleClaim = await ops.claim(stale.id, 0, 'fixture');
    const newSuggestion = {
      ...output,
      suggestions: [
        { ...output.suggestions[0], id: randomUUID(), before: 'Developed interfaces using React.' },
      ],
    };
    await ops.finish(stale.id, staleClaim!.attempt.id, newSuggestion);
    await resumes.saveProfile(owner, { revision: 1, content: profile });
    await expect(
      ops.decide(owner, stale.id, {
        revision: changed.revision,
        suggestionId: newSuggestion.suggestions[0].id,
        decision: 'accepted',
      }),
    ).rejects.toThrow('Profile changed');
  });
});

describe('Provider-independent AI boundary', () => {
  const input = analysisInputSchema.parse({
    draftId: randomUUID(),
    revision: 0,
    profileRevision: 1,
    profile,
    content: {
      headline: '',
      blocks: [
        {
          factId,
          kind: 'experience',
          title: 'Engineer',
          context: '',
          text: 'Built React interfaces.',
        },
      ],
    },
    vacancy: { description: 'React required.' },
  });
  it('rejects invented evidence and mismatched quotations', () => {
    expect(() =>
      validateAnalysis(
        {
          requirements: [
            {
              id: randomUUID(),
              quote: 'Kubernetes',
              kind: 'mandatory',
              state: 'supported',
              factIds: [randomUUID()],
            },
          ],
          suggestions: [],
        },
        input,
      ),
    ).toThrow('validation');
    expect(() =>
      validateAnalysis(
        {
          requirements: [],
          suggestions: [
            {
              id: randomUUID(),
              factId,
              before: 'Invented source',
              after: 'Made up results',
              reason: 'Bad',
            },
          ],
        },
        input,
      ),
    ).toThrow('source');
  });
  it('classifies rate limits without retaining secret provider response bodies', async () => {
    const provider = new OpenAiProvider(
      'test-only-key',
      'test-model',
      async () => new Response('private provider detail', { status: 429 }),
    );
    await expect(provider.analyze(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
      retryable: true,
    });
  });
  it('uses structured Responses output, omits contacts and marks storage disabled', async () => {
    let body: Record<string, unknown> = {};
    const provider = new OpenAiProvider('synthetic', 'test-model', async (_url, options) => {
      body = JSON.parse(String(options?.body));
      return Response.json({
        status: 'completed',
        output: [
          {
            content: [
              { type: 'output_text', text: JSON.stringify({ requirements: [], suggestions: [] }) },
            ],
          },
        ],
      });
    });
    expect(await provider.analyze(input, new AbortController().signal)).toEqual({
      requirements: [],
      suggestions: [],
    });
    expect(body.store).toBe(false);
    expect(body.input).not.toContain('Synthetic Candidate');
    expect(body.text).toMatchObject({ format: { type: 'json_schema', strict: true } });
  });
  it('rejects refusals and malformed output as permanent errors', async () => {
    const provider = new OpenAiProvider('synthetic', 'test-model', async () =>
      Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }),
    );
    await expect(provider.analyze(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'PROVIDER_REFUSAL',
      retryable: false,
    });
    const broken = new OpenAiProvider(
      'synthetic',
      'test-model',
      async () => new Response('not-json'),
    );
    await expect(broken.analyze(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
      retryable: false,
    });
  });
});
