import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database } from '../apps/api/src/database';
import { DiscoveryService } from '../apps/api/src/discovery.service';
import { OperationsService } from '../apps/api/src/operations.service';
import { ResumeService } from '../apps/api/src/resume.service';
import { CrmService } from '../apps/api/src/crm.service';
import {
  fetchListings,
  normalize,
  publicUrl,
  searchSchema,
  matchingReasons,
  SOURCE_INTERVAL_MS,
} from '../apps/api/src/discovery.connectors';
import { OperationError } from '../apps/api/src/ai.provider';

const remotive = {
  jobs: [
    {
      id: 123,
      title: 'Senior React Engineer',
      company_name: 'Synthetic Discovery',
      description: '<p>React &amp; TypeScript</p><script>alert(1)</script><p>Remote team</p>',
      url: 'https://remotive.com/remote-jobs/software-dev/synthetic-123',
      candidate_required_location: 'Europe',
      publication_date: '2026-10-01',
    },
  ],
};
const arbeitnow = {
  data: [
    {
      slug: 'synthetic-react',
      title: 'Senior React Engineer',
      company_name: 'Synthetic Discovery',
      description: '<p>React and TypeScript</p>',
      url: 'https://www.arbeitnow.com/jobs/synthetic-react',
      remote: true,
      location: 'Germany',
      created_at: 1790812800,
    },
    {
      slug: 'office',
      title: 'Office role',
      company_name: 'Other',
      description: 'Office',
      url: 'https://www.arbeitnow.com/jobs/office',
      remote: false,
      location: 'Berlin',
    },
  ],
};
describe('connector contracts and network boundary', () => {
  it('normalizes provider identity, attribution and text without implying eligibility', () => {
    const records = normalize('remotive', remotive);
    expect(records[0].description).toBe('React & TypeScript\n\nRemote team');
    expect(records[0].externalId).toBe('123');
    expect(normalize('arbeitnow', arbeitnow)).toHaveLength(1);
    expect(
      matchingReasons(
        records[0],
        searchSchema.parse({ keywords: 'REACT TypeScript', location: 'europe' }),
      ),
    ).toEqual(['Keyword: react', 'Keyword: typescript', 'Location: europe']);
  });
  it.each([
    'http://example.com',
    'https://127.0.0.1',
    'https://[::1]',
    'https://localhost',
    'https://service.internal',
    'https://example.com:45432',
  ])('rejects unsafe destination %s', (value) => expect(publicUrl(value)).toBe(false));
  it('rejects credential-bearing URLs', () => {
    const url = new URL('https://example.com');
    url.username = 'fixture';
    url.password = 'fixture';
    expect(publicUrl(url.href)).toBe(false);
  });
  it('fails whole imports on format changes and duplicate source IDs', () => {
    expect(() => normalize('remotive', { jobs: [{ title: 'Changed' }] })).toThrow(
      'Source format changed',
    );
    expect(() => normalize('remotive', { jobs: [...remotive.jobs, ...remotive.jobs] })).toThrow();
    expect(() =>
      normalize('remotive', { jobs: [{ ...remotive.jobs[0], url: 'https://other.com/job' }] }),
    ).toThrow();
  });
  it('uses only fixed URLs with redirects disabled', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(remotive), { headers: { 'Content-Type': 'application/json' } }),
      );
    await fetchListings('remotive', fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://remotive.com/api/remote-jobs?category=software-dev',
    );
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('honors Retry-After and bounds response bodies', async () => {
    try {
      await fetchListings(
        'remotive',
        vi
          .fn()
          .mockResolvedValue(
            new Response('', { status: 429, headers: { 'Retry-After': '86400' } }),
          ),
      );
      throw new Error('Expected rejection');
    } catch (error) {
      expect((error as OperationError).code).toBe('SOURCE_HTTP_429');
      expect((error as OperationError).retryAfterMs).toBe(86400000);
    }
    await expect(
      fetchListings(
        'arbeitnow',
        vi.fn().mockResolvedValue(
          new Response('x'.repeat(8 * 1024 * 1024 + 1), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_TOO_LARGE' });
    await expect(
      fetchListings(
        'arbeitnow',
        vi
          .fn()
          .mockResolvedValue(
            new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
          ),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_FORMAT' });
  });
});

describe('additional public feeds', () => {
  const himalaya = {
    guid: 'https://himalayas.app/jobs/review',
    title: 'React Engineer',
    companyName: 'Fixture',
    description: '<p>React</p>',
    applicationLink: 'https://himalayas.app/jobs/review',
    locationRestrictions: ['United States'],
    pubDate: 1790812800,
  };
  it('normalizes timestamps, country restrictions and source attribution', () => {
    const jobicy = normalize('jobicy', {
      success: true,
      jobs: [
        {
          id: 10,
          jobTitle: 'React Engineer',
          companyName: 'Fixture',
          jobDescription: '<p>React</p>',
          url: 'https://jobicy.com/jobs/review',
          jobGeo: 'Europe',
          pubDate: '2026-10-01T00:00:00Z',
        },
      ],
    });
    expect(jobicy[0].publishedAt).toBe('2026-10-01T00:00:00.000Z');
    const himalayas = normalize('himalayas', { jobs: [himalaya] });
    expect(himalayas[0].location).toBe('United States');
    const broadCountries = Array.from({ length: 100 }, (_, i) => 'Country restriction ' + i);
    expect(
      normalize('himalayas', { jobs: [{ ...himalaya, locationRestrictions: broadCountries }] })[0]
        .location,
    ).toBe(broadCountries.join(', '));
    expect(himalayas[0].publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(
      normalize('himalayas', {
        jobs: [
          { ...himalaya, locationRestrictions: [{ name: 'Germany' }], pubDate: 1790812800000 },
        ],
      })[0].location,
    ).toBe('Germany');
    const remoteok = normalize('remoteok', [
      { legal: 'Attribution required' },
      {
        id: '42',
        position: 'React Engineer',
        company: 'Fixture',
        description: 'React',
        url: 'https://remoteOK.com/jobs/review',
        date: '2026-10-01',
      },
    ]);
    expect(remoteok).toHaveLength(1);
    expect(remoteok[0].location).toBe('Unknown');
    expect(() => normalize('jobicy', { success: false, jobs: [] })).toThrow();
    expect(() =>
      normalize('himalayas', { jobs: [{ ...himalaya, applicationLink: 'https://other.com/job' }] }),
    ).toThrow();
  });
  it('bounds pagination and keeps provider cursor values on the fixed origin', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            jobs: [{ ...himalaya, guid: himalaya.guid + fetcher.mock.calls.length }],
            nextCursor: 'https://internal.example/' + fetcher.mock.calls.length,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    expect(await fetchListings('himalayas', fetcher)).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const call of fetcher.mock.calls) {
      expect(new URL(String(call[0])).origin).toBe('https://himalayas.app');
      expect(call[1]?.redirect).toBe('error');
    }
  });
  it('rejects duplicate pages atomically and honors the daily provider interval', async () => {
    await expect(
      fetchListings(
        'himalayas',
        vi.fn().mockImplementation(
          async () =>
            new Response(JSON.stringify({ jobs: [himalaya], nextCursor: 'again' }), {
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'SOURCE_FORMAT' });
    await expect(
      fetchListings('himalayas', vi.fn().mockResolvedValue(new Response('', { status: 429 }))),
    ).rejects.toMatchObject({ retryAfterMs: 86400000 });
    expect(searchSchema.parse({ company: 'Fixture', postedWithin: '30' }).company).toBe('Fixture');
    expect(() => searchSchema.parse({ postedWithin: '365' })).toThrow();
  });
});

const db = new Database(),
  discovery = new DiscoveryService(db),
  ops = new OperationsService(db, new ResumeService(db, new CrmService(db))),
  owner = `discovery-test-${randomUUID()}`;
beforeAll(async () => {
  await db.$connect();
});
afterAll(async () => {
  await db.discoveryListing.deleteMany({ where: { ownerId: owner } });
  await db.discoverySource.deleteMany({ where: { ownerId: owner } });
  await db.savedSearch.deleteMany({ where: { ownerId: owner } });
  await db.operationRun.deleteMany({ where: { ownerId: owner } });
  await db.vacancy.deleteMany({ where: { ownerId: owner } });
  await db.company.deleteMany({ where: { ownerId: owner } });
  await db.$disconnect();
});
async function imported(connector: 'remotive' | 'arbeitnow', payload: unknown) {
  await db.discoverySource.updateMany({
    where: { ownerId: owner, connector },
    data: { nextFetchAt: new Date(0) },
  });
  const run = (await discovery.enqueue(owner, connector))!;
  const claim = (await ops.claim(run.id, run.generation, 'synthetic-discovery-worker'))!;
  return {
    run,
    attempt: claim.attempt,
    output: await discovery.execute(
      run.id,
      claim.attempt.id,
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  };
}
describe('persistent discovery and lifecycle', () => {
  it('serializes overlapping imports and preserves decisions on identical/revised data', async () => {
    const [a, b] = await Promise.all([
      discovery.enqueue(owner, 'remotive'),
      discovery.enqueue(owner, 'remotive'),
    ]);
    expect(a!.id).toBe(b!.id);
    const claim = (await ops.claim(a!.id, a!.generation, 'fixture-worker'))!;
    const first = await discovery.execute(
      a!.id,
      claim.attempt.id,
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(remotive), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    expect(first.added).toBe(1);
    const item = (await discovery.list(owner, {})).items[0];
    await discovery.decide(owner, item.id, { action: 'dismissed' });
    expect((await imported('remotive', remotive)).output.unchanged).toBe(1);
    expect((await discovery.detail(owner, item.id)).snapshots).toHaveLength(1);
    const changed = {
      jobs: [{ ...remotive.jobs[0], description: 'React TypeScript. Updated requirements.' }],
    };
    expect((await imported('remotive', changed)).output.changed).toBe(1);
    const detail = await discovery.detail(owner, item.id);
    expect(detail.snapshots).toHaveLength(2);
    expect(detail.disposition).toBe('dismissed');
    await expect(discovery.enqueue(owner, 'remotive')).rejects.toThrow('interval');
    const sources = await discovery.sources(owner);
    expect(sources.find((s) => s.connector === 'remotive')!.nextFetchAt.getTime()).toBeGreaterThan(
      Date.now() + SOURCE_INTERVAL_MS - 3000,
    );
  });
  it('keeps cross-source duplicates reviewable and promotion idempotent', async () => {
    await imported('arbeitnow', arbeitnow);
    const list = await discovery.list(owner, { keywords: 'React TypeScript' });
    expect(list.total).toBe(2);
    expect(list.items[0].duplicateCandidates).toBe(1);
    const id = list.items[0].id;
    const [first, second] = await Promise.all([
      discovery.promote(owner, id),
      discovery.promote(owner, id),
    ]);
    expect(first.vacancyId).toBe(second.vacancyId);
    const vacancy = await db.vacancy.findUnique({ where: { id: first.vacancyId } });
    expect(vacancy!.eligibility).toBe('unknown');
    expect(await db.vacancy.count({ where: { ownerId: owner } })).toBe(1);
    await expect(discovery.detail('another-owner', id)).rejects.toThrow('not found');
    await expect(discovery.promote('another-owner', id)).rejects.toThrow('not found');
  });
  it('filters all words, seen status and location and persists owner-isolated searches', async () => {
    expect((await discovery.list(owner, { keywords: 'React Kubernetes' })).total).toBe(0);
    expect((await discovery.list(owner, { location: 'Germany' })).total).toBe(1);
    const unseen = await discovery.list(owner, { unseen: 'true' });
    expect(unseen.total).toBe(0);
    const saved = await discovery.saveSearch(owner, {
      name: 'React Europe',
      filters: { keywords: 'React', location: 'Europe' },
    });
    expect((await discovery.searches(owner))[0].id).toBe(saved.id);
    await discovery.deleteSearch('another-owner', saved.id);
    expect(await discovery.searches(owner)).toHaveLength(1);
    await discovery.deleteSearch(owner, saved.id);
  });
  it('rejects stale commits and reports old source data without marking jobs closed', async () => {
    const run = await discovery.enqueue(owner, 'remotive', true);
    expect(run).toBeNull();
    await db.discoverySource.updateMany({
      where: { ownerId: owner },
      data: { lastSuccessAt: new Date(0) },
    });
    expect((await discovery.sources(owner)).every((s) => s.health === 'stale')).toBe(true);
    const prior = await db.operationRun.findFirst({ where: { ownerId: owner } });
    await expect(discovery.commit(prior!.id, randomUUID(), [])).rejects.toMatchObject({
      code: 'SOURCE_LEASE',
    });
    expect((await discovery.list(owner, {})).total).toBe(2);
  });
  it('records network failure, reserves quota and defers retries without immediate refetch', async () => {
    await db.discoverySource.updateMany({
      where: { ownerId: owner, connector: 'remotive' },
      data: { nextFetchAt: new Date(0) },
    });
    const run = (await discovery.enqueue(owner, 'remotive'))!,
      claim = (await ops.claim(run.id, run.generation, 'fixture-worker'))!;
    const fetcher = vi.fn().mockRejectedValue(new Error('Private provider response'));
    let error: OperationError | undefined;
    try {
      await discovery.execute(run.id, claim.attempt.id, fetcher);
    } catch (e) {
      error = e as OperationError;
    }
    expect(error!.code).toBe('SOURCE_NETWORK');
    await ops.fail(run.id, claim.attempt.id, error!);
    const failed = await ops.get(owner, run.id);
    expect(failed.status).toBe('retrying');
    expect(failed.attempts[0].errorReason).not.toContain('Private');
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + SOURCE_INTERVAL_MS - 3000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('schedules only enabled sources, prevents overlaps and fences expired imports', async () => {
    await db.discoverySource.updateMany({
      where: { ownerId: owner, connector: 'arbeitnow' },
      data: { nextFetchAt: new Date(0) },
    });
    await discovery.configure(owner, 'arbeitnow', { enabled: true });
    await Promise.all([discovery.schedule(), discovery.schedule()]);
    const source = await db.discoverySource.findUniqueOrThrow({
      where: { ownerId_connector: { ownerId: owner, connector: 'arbeitnow' } },
    });
    const pending = await db.operationRun.findMany({
      where: { ownerId: owner, targetId: source.id, status: 'queued' },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].nextTrigger).toBe('scheduled');
    const claim = (await ops.claim(pending[0].id, 0, 'fixture-worker'))!;
    await db.operationRun.update({
      where: { id: pending[0].id },
      data: { leaseUntil: new Date(0) },
    });
    await expect(
      discovery.commit(pending[0].id, claim.attempt.id, normalize('arbeitnow', arbeitnow)),
    ).rejects.toMatchObject({ code: 'SOURCE_LEASE' });
    await db.operationRun.update({
      where: { id: pending[0].id },
      data: { status: 'failed', activeAttemptId: null, leaseUntil: null },
    });
    await discovery.configure(owner, 'arbeitnow', { enabled: false });
    await discovery.schedule();
    expect(
      await db.operationRun.count({
        where: { ownerId: owner, targetId: source.id, status: 'queued' },
      }),
    ).toBe(0);
  });
});
