import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database } from './database';
import { parse } from './crm.service';
import { OperationError } from './ai.provider';
import {
  connectorSchema,
  connectors,
  fetchListings,
  matchingReasons,
  searchSchema,
  sourceInterval,
  type Connector,
  type ListingInput,
} from './discovery.connectors';
import type { Prisma } from './generated/prisma/client';

@Injectable()
export class DiscoveryService {
  constructor(@Inject(Database) readonly db: Database) {}
  async sources(ownerId: string) {
    for (const connector of Object.keys(connectors))
      await this.db.discoverySource.upsert({
        where: { ownerId_connector: { ownerId, connector } },
        create: { ownerId, connector },
        update: {},
      });
    const sources = await this.db.discoverySource.findMany({
      where: { ownerId },
      orderBy: { connector: 'asc' },
    });
    return Promise.all(
      sources.map(async (source) => {
        const lastRun = source.lastRunId
          ? await this.db.operationRun.findFirst({
              where: { id: source.lastRunId, ownerId },
              select: {
                id: true,
                status: true,
                errorCode: true,
                errorReason: true,
                nextAttemptAt: true,
              },
            })
          : null;
        return {
          ...source,
          ...connectors[source.connector as Connector],
          endpoint: undefined,
          health:
            lastRun?.errorCode && ['failed', 'retrying'].includes(lastRun.status)
              ? 'degraded'
              : !source.lastSuccessAt
                ? 'unknown'
                : source.lastSuccessAt.getTime() <
                    Date.now() - 2 * sourceInterval(source.connector as Connector)
                  ? 'stale'
                  : 'healthy',
          lastRun,
        };
      }),
    );
  }
  async configure(ownerId: string, connector: string, body: unknown) {
    parse(connectorSchema, connector);
    const data = parse(z.object({ enabled: z.boolean() }).strict(), body);
    return this.db.discoverySource.upsert({
      where: { ownerId_connector: { ownerId, connector } },
      create: { ownerId, connector, ...data },
      update: data,
    });
  }
  async enqueue(ownerId: string, connector: string, scheduled = false) {
    parse(connectorSchema, connector);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId + '-source-' + connector}))::text`;
      const source = await tx.discoverySource.upsert({
        where: { ownerId_connector: { ownerId, connector } },
        create: { ownerId, connector },
        update: {},
      });
      if (scheduled && !source.enabled) return null;
      const pending = await tx.operationRun.findFirst({
        where: {
          ownerId,
          kind: 'source_import',
          targetId: source.id,
          status: { in: ['queued', 'running', 'retrying'] },
        },
      });
      if (pending) return pending;
      if (source.nextFetchAt > new Date()) {
        if (scheduled) return null;
        throw new ConflictException(
          'Source request interval has not elapsed. Check the next fetch time.',
        );
      }
      const run = await tx.operationRun.create({
        data: {
          ownerId,
          kind: 'source_import',
          targetId: source.id,
          requestKey: `source-${randomUUID()}`,
          input: { connector },
          nextTrigger: scheduled ? 'scheduled' : 'initial',
          nextRequestedBy: scheduled ? 'system' : ownerId,
        },
      });
      await tx.discoverySource.update({ where: { id: source.id }, data: { lastRunId: run.id } });
      return run;
    });
  }
  async schedule() {
    const due = await this.db.discoverySource.findMany({
      where: { enabled: true, nextFetchAt: { lte: new Date() } },
      take: 50,
    });
    for (const source of due) await this.enqueue(source.ownerId, source.connector, true);
  }
  async execute(runId: string, attemptId: string, fetcher: typeof fetch = fetch) {
    const run = await this.db.operationRun.findUnique({ where: { id: runId } });
    if (!run || run.kind !== 'source_import' || !run.targetId)
      throw new OperationError('SOURCE_RUN', 'Source operation not found.');
    const connector = connectorSchema.parse((run.input as { connector: string }).connector);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiscoverySource" WHERE id=${run.targetId} FOR UPDATE`;
      const source = await tx.discoverySource.findFirst({
        where: { id: run.targetId!, ownerId: run.ownerId, connector },
      });
      if (!source) throw new OperationError('SOURCE_RUN', 'Source configuration not found.');
      if (source.nextFetchAt > new Date()) {
        const error = new OperationError(
          'SOURCE_COOLDOWN',
          'Source request interval is active; retry is deferred.',
          true,
        );
        error.retryAfterMs = source.nextFetchAt.getTime() - Date.now();
        throw error;
      }
      const active = await tx.operationRun.findFirst({
        where: {
          id: runId,
          status: 'running',
          activeAttemptId: attemptId,
          leaseUntil: { gt: new Date() },
        },
      });
      if (!active) throw new OperationError('SOURCE_LEASE', 'Source execution lease expired.');
      await tx.discoverySource.update({
        where: { id: source.id },
        data: { nextFetchAt: new Date(Date.now() + sourceInterval(connector)) },
      });
    });
    try {
      return await this.commit(runId, attemptId, await fetchListings(connector, fetcher));
    } catch (error) {
      if (error instanceof OperationError && error.retryAfterMs)
        await this.db.discoverySource.updateMany({
          where: { id: run.targetId },
          data: {
            nextFetchAt: new Date(
              Date.now() + Math.max(sourceInterval(connector), error.retryAfterMs),
            ),
          },
        });
      throw error;
    }
  }
  async commit(runId: string, attemptId: string, items: ListingInput[]) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "OperationRun" WHERE id=${runId} FOR UPDATE`;
        const run = await tx.operationRun.findUnique({ where: { id: runId } });
        if (
          !run ||
          run.status !== 'running' ||
          run.activeAttemptId !== attemptId ||
          !run.leaseUntil ||
          run.leaseUntil <= new Date() ||
          !run.targetId
        )
          throw new OperationError('SOURCE_LEASE', 'Source commit lease expired.');
        const connector = connectorSchema.parse((run.input as { connector: string }).connector);
        let added = 0,
          changed = 0;
        for (const item of items) {
          const contentHash = createHash('sha256').update(JSON.stringify(item)).digest('hex');
          const key = { ownerId: run.ownerId, connector, externalId: item.externalId };
          const old = await tx.discoveryListing.findUnique({
            where: { ownerId_connector_externalId: key },
          });
          const listing = old
            ? await tx.discoveryListing.update({
                where: { id: old.id },
                data: { ...item, contentHash, lastSeenAt: new Date() },
              })
            : await tx.discoveryListing.create({ data: { ...key, ...item, contentHash } });
          if (!old || old.contentHash !== contentHash) {
            await tx.discoverySnapshot.create({
              data: { listingId: listing.id, runId, content: item },
            });
            if (old) changed++;
            else added++;
          }
        }
        const output = {
          imported: items.length,
          added,
          changed,
          unchanged: items.length - added - changed,
        };
        await tx.discoverySource.update({
          where: { id: run.targetId },
          data: { lastSuccessAt: new Date(), lastRunId: run.id },
        });
        await tx.operationRun.update({
          where: { id: runId },
          data: {
            status: 'succeeded',
            output,
            completedAt: new Date(),
            leaseUntil: null,
            activeAttemptId: null,
            errorCode: null,
            errorReason: null,
            retryable: false,
          },
        });
        await tx.operationAttempt.update({
          where: { id: attemptId },
          data: { status: 'succeeded', finishedAt: new Date() },
        });
        return output;
      },
      { timeout: 20000 },
    );
  }
  async list(ownerId: string, query: Record<string, unknown>) {
    const { page: rawPage, ...raw } = query;
    const filters = parse(searchSchema, {
      ...raw,
      unseen: raw.unseen === 'true' || raw.unseen === true,
    });
    const page = parse(z.coerce.number().int().min(1).max(100000).default(1), rawPage);
    const terms = [...new Set(filters.keywords.split(/\s+/).filter(Boolean))];
    const where: Prisma.DiscoveryListingWhereInput = {
      ownerId,
      ...(filters.connector ? { connector: filters.connector } : {}),
      ...(filters.disposition ? { disposition: filters.disposition } : {}),
      ...(filters.unseen ? { seenAt: null } : {}),
      ...(filters.company ? { company: { contains: filters.company, mode: 'insensitive' } } : {}),
      ...(filters.postedWithin
        ? {
            publishedAt: {
              gte: new Date(Date.now() - Number(filters.postedWithin) * 86400000).toISOString(),
              lte: new Date().toISOString(),
            },
          }
        : {}),
      ...(filters.location
        ? { location: { contains: filters.location, mode: 'insensitive' } }
        : {}),
      AND: terms.map((term) => ({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      })),
    };
    const [total, rows] = await this.db.$transaction(
      [
        this.db.discoveryListing.count({ where }),
        this.db.discoveryListing.findMany({
          where,
          orderBy:
            filters.sort === 'published'
              ? [
                  { publishedAt: { sort: 'desc', nulls: 'last' } },
                  { firstSeenAt: 'desc' },
                  { id: 'asc' },
                ]
              : [{ firstSeenAt: 'desc' }, { id: 'asc' }],
          take: 20,
          skip: (page - 1) * 20,
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const items = await Promise.all(
      rows.map(async (item) => ({
        ...item,
        description: undefined,
        eligibility: 'unknown',
        reasons: matchingReasons(item, filters),
        duplicateCandidates: await this.db.discoveryListing.count({
          where: {
            ownerId,
            id: { not: item.id },
            company: { equals: item.company, mode: 'insensitive' },
            title: { equals: item.title, mode: 'insensitive' },
          },
        }),
      })),
    );
    return { total, page, items };
  }
  async detail(ownerId: string, id: string) {
    const item = await this.db.discoveryListing.findFirst({
      where: { id, ownerId },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 20 } },
    });
    if (!item) throw new NotFoundException('Discovery listing not found.');
    const duplicates = await this.db.discoveryListing.findMany({
      where: {
        ownerId,
        id: { not: id },
        company: { equals: item.company, mode: 'insensitive' },
        title: { equals: item.title, mode: 'insensitive' },
      },
      select: { id: true, connector: true, title: true, url: true },
      take: 20,
    });
    return { ...item, eligibility: 'unknown', duplicates };
  }
  async decide(ownerId: string, id: string, body: unknown) {
    const data = parse(
      z.object({ action: z.enum(['seen', 'inbox', 'shortlisted', 'dismissed']) }).strict(),
      body,
    );
    await this.detail(ownerId, id);
    return this.db.discoveryListing.update({
      where: { id },
      data: { seenAt: new Date(), ...(data.action !== 'seen' ? { disposition: data.action } : {}) },
    });
  }
  async promote(ownerId: string, id: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiscoveryListing" WHERE id=${id} AND "ownerId"=${ownerId} FOR UPDATE`;
      const listing = await tx.discoveryListing.findFirst({ where: { id, ownerId } });
      if (!listing) throw new NotFoundException('Discovery listing not found.');
      if (listing.promotedVacancyId) return { vacancyId: listing.promotedVacancyId };
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId + '-company-' + listing.company.toLowerCase()}))::text`;
      const company =
        (await tx.company.findFirst({
          where: {
            ownerId,
            archived: false,
            name: { equals: listing.company, mode: 'insensitive' },
          },
        })) ?? (await tx.company.create({ data: { ownerId, name: listing.company } }));
      const vacancy = await tx.vacancy.create({
        data: {
          ownerId,
          companyId: company.id,
          title: listing.title,
          description: listing.description,
          url: listing.url,
          source: connectors[listing.connector as Connector].name,
          location: listing.location,
        },
      });
      await tx.discoveryListing.update({
        where: { id },
        data: { promotedVacancyId: vacancy.id, seenAt: new Date(), disposition: 'shortlisted' },
      });
      return { vacancyId: vacancy.id };
    });
  }
  searches(ownerId: string) {
    return this.db.savedSearch.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
  }
  async saveSearch(ownerId: string, body: unknown) {
    const data = parse(
      z.object({ name: z.string().trim().min(1).max(80), filters: searchSchema }).strict(),
      body,
    );
    if ((await this.db.savedSearch.count({ where: { ownerId } })) >= 50)
      throw new BadRequestException('Saved search limit reached. Delete an unused search.');
    return this.db.savedSearch.create({ data: { ownerId, ...data } });
  }
  async deleteSearch(ownerId: string, id: string) {
    return this.db.savedSearch.deleteMany({ where: { ownerId, id } });
  }
}
