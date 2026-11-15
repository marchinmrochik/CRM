import { describe, expect, it } from 'vitest';
import { buildReport, evidence, type AnalyticsApplication } from '../packages/analytics/src';
const asOf = '2026-10-05T12:00:00.000Z';
const app = (patch: Partial<AnalyticsApplication> = {}): AnalyticsApplication => ({
  id: 'one',
  title: 'Role',
  company: 'Example',
  source: 'Captured source',
  status: 'in_progress',
  submittedAt: '2026-09-01T00:00:00.000Z',
  resumeKey: 'version-one',
  resumeLabel: 'Sent version · v1',
  resumeVersionId: 'version-id',
  events: [],
  interviews: [],
  ...patch,
});
const event = (id: string, kind: string, occurredAt: string, type = 'milestone_recorded') => ({
  id,
  type,
  occurredAt,
  metadata: { kind },
});
describe('submission cohort analytics', () => {
  it('excludes drafts, future submissions and counts each stage once with its earliest evidence', () => {
    const rows = [
      app({
        events: [
          event('a', 'recruiter_response', '2026-09-03T00:00:00.000Z'),
          event('b', 'recruiter_response', '2026-09-02T00:00:00.000Z'),
        ],
      }),
      app({ id: 'draft', submittedAt: null }),
      app({ id: 'future', submittedAt: '2026-10-06T00:00:00.000Z' }),
    ];
    const report = buildReport(rows, {}, asOf);
    expect(report.submitted).toBe(1);
    expect(report.stages[0].count).toBe(1);
    expect(report.responseTime).toEqual({ sample: 1, medianHours: 24, p90Hours: 24 });
  });
  it('does not infer earlier stages and uses intersections for conditional conversion', () => {
    const rows = [
      app({ id: 'skip', events: [event('a', 'offer', '2026-09-05T00:00:00.000Z')] }),
      app({
        id: 'response',
        events: [event('b', 'recruiter_response', '2026-09-02T00:00:00.000Z')],
      }),
    ];
    const report = buildReport(rows, {}, asOf);
    expect(report.stages[0]).toMatchObject({
      count: 1,
      denominator: 2,
      percent: 50,
      missingEarlierEvidence: 1,
    });
    expect(report.stages[4].transition).toEqual({ count: 0, denominator: 0, percent: null });
    expect(report.noRecordedResponse).toBe(1);
  });
  it('preserves historical offers after rejection and reopening while current outcomes remain unresolved', () => {
    const application = app({
      events: [
        {
          id: 'offer',
          type: 'status_changed',
          occurredAt: '2026-09-08T00:00:00.000Z',
          metadata: { to: 'offer_received' },
        },
        {
          id: 'reopen',
          type: 'status_changed',
          occurredAt: '2026-09-10T00:00:00.000Z',
          metadata: { to: 'in_progress', reopened: true },
        },
      ],
    });
    const report = buildReport([application], {}, asOf);
    expect(report.stages[4].count).toBe(1);
    expect(report.unresolved).toBe(1);
    expect(report.reopened).toBe(1);
    expect(report.rejected).toBe(0);
    expect(report.unresolvedAge.older).toBe(1);
  });
  it('applies append-only corrections and rejects out-of-range evidence without zeroing missing responses', () => {
    const application = app({
      events: [
        event('response', 'recruiter_response', '2026-09-02T00:00:00.000Z'),
        {
          id: 'void',
          type: 'milestone_voided',
          occurredAt: '2026-09-03T00:00:00.000Z',
          metadata: { eventId: 'response' },
        },
        event('early', 'interview', '2026-08-01T00:00:00.000Z'),
        event('late', 'offer', '2026-11-01T00:00:00.000Z'),
      ],
    });
    const report = buildReport([application], {}, asOf);
    expect(report.responseTime.sample).toBe(0);
    expect(report.responseTime.medianHours).toBeNull();
    expect(report.evidenceIssues).toBe(2);
  });
  it('counts completed final interviews but excludes scheduled or cancelled appointments', () => {
    const application = app({
      interviews: [{ id: 'final', type: 'final' }],
      events: [
        {
          id: 'complete',
          type: 'interview_completed',
          occurredAt: '2026-09-03T00:00:00.000Z',
          metadata: { interviewId: 'final' },
        },
        {
          id: 'scheduled',
          type: 'interview_scheduled',
          occurredAt: '2026-09-02T00:00:00.000Z',
          metadata: {},
        },
      ],
    });
    const observed = evidence(application, asOf).milestones;
    expect(observed.interview).toBeDefined();
    expect(observed.final_interview).toBeDefined();
    expect(observed.human_interaction).toBeUndefined();
  });
  it('uses inclusive UTC submission days and keeps source and sent-resume groups stable', () => {
    const rows = [
      app({ id: 'start', submittedAt: '2026-09-01T00:00:00.000Z' }),
      app({
        id: 'end',
        submittedAt: '2026-09-01T23:59:59.999Z',
        source: 'Other source',
        resumeKey: 'two',
        resumeLabel: 'Other version',
      }),
      app({ id: 'next', submittedAt: '2026-09-02T00:00:00.000Z' }),
    ];
    const report = buildReport(rows, { from: '2026-09-01', to: '2026-09-01' }, asOf);
    expect(report.submitted).toBe(2);
    expect(report.sources).toHaveLength(2);
    expect(report.resumes).toHaveLength(2);
    expect(report.sources.every((s) => s.smallSample)).toBe(true);
    const subset = buildReport(
      rows,
      { from: '2026-09-01', to: '2026-09-01', source: 'Other source' },
      asOf,
    );
    expect(subset.submitted).toBe(1);
    expect(subset.dimensions.sources).toHaveLength(2);
  });
  it('reports known medians and nearest-rank p90 with their actual sample size', () => {
    const rows = [1, 2, 3, 4].map((n) =>
      app({
        id: String(n),
        events: [event(String(n), 'recruiter_response', `2026-09-0${n + 1}T00:00:00.000Z`)],
      }),
    );
    rows.push(app({ id: 'unanswered' }));
    expect(buildReport(rows, {}, asOf).responseTime).toEqual({
      sample: 4,
      medianHours: 60,
      p90Hours: 96,
    });
  });
  it('keeps empty denominators null and limits detail rows without truncating aggregates', () => {
    const empty = buildReport([], {}, asOf);
    expect(empty.stages.every((s) => s.percent === null)).toBe(true);
    const report = buildReport(
      Array.from({ length: 65 }, (_, i) => app({ id: String(i) })),
      {},
      asOf,
    );
    expect(report.submitted).toBe(65);
    expect(report.applications).toHaveLength(50);
  });
});
