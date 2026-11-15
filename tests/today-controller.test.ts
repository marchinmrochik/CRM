import { afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../apps/api/src/database', () => ({ Database: class {} }));
import { CrmController, ownerId } from '../apps/api/src/crm.controller';
import type { CrmService } from '../apps/api/src/crm.service';
afterEach(() => vi.useRealTimers());
describe('Today aggregation ownership and scheduling boundary', () => {
  it('bounds pending actions and interviews to the owner and coming week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const db = {
      nextAction: { findMany: vi.fn().mockResolvedValue([{ id: 'action' }]) },
      interview: { findMany: vi.fn().mockResolvedValue([{ id: 'interview' }]) },
      discoveryListing: { count: vi.fn().mockResolvedValue(5) },
      application: { count: vi.fn().mockResolvedValue(2) },
      $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    expect(await new CrmController({ db } as unknown as CrmService).today()).toEqual({
      actions: [{ id: 'action' }],
      interviews: [{ id: 'interview' }],
      unseen: 5,
      drafts: 2,
    });
    expect(db.nextAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          application: { ownerId },
          completedAt: null,
          dueAt: { lte: new Date('2026-11-08T12:00:00Z') },
        },
        orderBy: { dueAt: 'asc' },
        take: 20,
      }),
    );
    expect(db.interview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          application: { ownerId },
          status: 'scheduled',
          scheduledAt: { lte: new Date('2026-11-08T12:00:00Z') },
        },
        take: 20,
      }),
    );
    expect(db.discoveryListing.count).toHaveBeenCalledWith({
      where: { ownerId, seenAt: null, disposition: { not: 'dismissed' } },
    });
    expect(db.application.count).toHaveBeenCalledWith({ where: { ownerId, status: 'draft' } });
  });
});
