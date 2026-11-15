export const milestoneKinds = [
  'recruiter_response',
  'human_interaction',
  'interview',
  'final_interview',
  'offer',
] as const;
export type Milestone = (typeof milestoneKinds)[number];
export type EvidenceEvent = {
  id: string;
  type: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};
export type AnalyticsApplication = {
  id: string;
  title: string;
  company: string;
  source: string;
  status: string;
  submittedAt: string | null;
  resumeKey: string;
  resumeLabel: string;
  resumeVersionId: string | null;
  events: EvidenceEvent[];
  interviews: { id: string; type: string }[];
};
export type CohortFilters = { from?: string; to?: string; source?: string; resumeKey?: string };
export type Evidence = {
  milestones: Partial<Record<Milestone, string>>;
  invalid: number;
  reopened: boolean;
};
const time = (value: string) => Date.parse(value);
export function evidence(application: AnalyticsApplication, asOf: string): Evidence {
  const milestones: Evidence['milestones'] = {};
  let invalid = 0;
  if (!application.submittedAt) return { milestones, invalid, reopened: false };
  const start = time(application.submittedAt),
    end = time(asOf);
  const voided = new Set(
    application.events
      .filter((e) => e.type === 'milestone_voided' && time(e.occurredAt) <= end)
      .map((e) => String(e.metadata.eventId)),
  );
  const add = (kind: Milestone, at: string) => {
    const timestamp = time(at);
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) {
      invalid++;
      return;
    }
    if (!milestones[kind] || timestamp < time(milestones[kind]!)) milestones[kind] = at;
  };
  for (const event of application.events) {
    if (voided.has(event.id)) continue;
    if (
      event.type === 'milestone_recorded' &&
      milestoneKinds.includes(event.metadata.kind as Milestone)
    )
      add(event.metadata.kind as Milestone, event.occurredAt);
    if (event.type === 'status_changed' && event.metadata.to === 'offer_received')
      add('offer', event.occurredAt);
    if (event.type === 'interview_completed') {
      add('interview', event.occurredAt);
      const interview = application.interviews.find((i) => i.id === event.metadata.interviewId);
      if (interview?.type === 'final') add('final_interview', event.occurredAt);
    }
  }
  return {
    milestones,
    invalid,
    reopened: application.events.some(
      (e) =>
        e.type === 'status_changed' && e.metadata.reopened === true && time(e.occurredAt) <= end,
    ),
  };
}
const pct = (count: number, denominator: number) =>
  denominator ? Math.round((count / denominator) * 1000) / 10 : null;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
};
type Observed = AnalyticsApplication & { evidence: Evidence };
function metrics(rows: Observed[], asOf: string) {
  const stages = milestoneKinds.map((kind, index) => {
    const count = rows.filter((r) => r.evidence.milestones[kind]).length;
    const previous = index ? milestoneKinds[index - 1] : null;
    const denominator = previous
      ? rows.filter((r) => r.evidence.milestones[previous]).length
      : rows.length;
    const both = previous
      ? rows.filter((r) => r.evidence.milestones[kind] && r.evidence.milestones[previous]).length
      : count;
    return {
      kind,
      count,
      denominator: rows.length,
      percent: pct(count, rows.length),
      transition: { count: both, denominator, percent: pct(both, denominator) },
      missingEarlierEvidence: rows.filter(
        (r) =>
          !r.evidence.milestones[kind] &&
          milestoneKinds.slice(index + 1).some((k) => r.evidence.milestones[k]),
      ).length,
    };
  });
  const unresolved = rows.filter((r) => !['accepted', 'rejected', 'withdrawn'].includes(r.status));
  const delays = rows
    .flatMap((r) =>
      r.evidence.milestones.recruiter_response
        ? [(time(r.evidence.milestones.recruiter_response) - time(r.submittedAt!)) / 3600000]
        : [],
    )
    .sort((a, b) => a - b);
  const age = (r: Observed) => (time(asOf) - time(r.submittedAt!)) / 86400000;
  return {
    submitted: rows.length,
    stages,
    unresolved: unresolved.length,
    accepted: rows.filter((r) => r.status === 'accepted').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    withdrawn: rows.filter((r) => r.status === 'withdrawn').length,
    noRecordedResponse: rows.filter((r) => !r.evidence.milestones.recruiter_response).length,
    reopened: rows.filter((r) => r.evidence.reopened).length,
    evidenceIssues: rows.reduce((sum, r) => sum + r.evidence.invalid, 0),
    unresolvedAge: {
      week: unresolved.filter((r) => age(r) <= 7).length,
      month: unresolved.filter((r) => age(r) > 7 && age(r) <= 30).length,
      older: unresolved.filter((r) => age(r) > 30).length,
    },
    responseTime: {
      sample: delays.length,
      medianHours: median(delays),
      p90Hours: delays.length ? delays[Math.ceil(delays.length * 0.9) - 1] : null,
    },
  };
}
export function buildReport(
  applications: AnalyticsApplication[],
  filters: CohortFilters,
  asOf: string,
) {
  const start = filters.from ? time(`${filters.from}T00:00:00.000Z`) : -Infinity;
  const end = filters.to ? time(`${filters.to}T00:00:00.000Z`) + 86400000 : Infinity;
  const cohort = applications.filter(
    (r) =>
      r.submittedAt &&
      time(r.submittedAt) >= start &&
      time(r.submittedAt) < end &&
      time(r.submittedAt) <= time(asOf),
  );
  const rows = cohort
    .filter(
      (r) =>
        (!filters.source || r.source === filters.source) &&
        (!filters.resumeKey || r.resumeKey === filters.resumeKey),
    )
    .map((r) => ({ ...r, evidence: evidence(r, asOf) }));
  const group = (key: 'source' | 'resumeKey') =>
    [...new Set(rows.map((r) => r[key]))].sort().map((value) => {
      const members = rows.filter((r) => r[key] === value);
      return {
        key: value,
        label: key === 'source' ? value : members[0].resumeLabel,
        smallSample: members.length < 5,
        ...metrics(members, asOf),
      };
    });
  return {
    schemaVersion: 1,
    asOf,
    filters,
    ...metrics(rows, asOf),
    sources: group('source'),
    resumes: group('resumeKey'),
    dimensions: {
      sources: [...new Set(cohort.map((r) => r.source))].sort(),
      resumes: [
        ...new Map(
          cohort.map((r) => [r.resumeKey, { key: r.resumeKey, label: r.resumeLabel }]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    },
    applications: [...rows]
      .sort((a, b) => time(b.submittedAt!) - time(a.submittedAt!))
      .slice(0, 50)
      .map(({ events: _events, interviews: _interviews, ...row }) => {
        void _events;
        void _interviews;
        return row;
      }),
    detailLimit: 50,
  };
}
export type AnalyticsReport = ReturnType<typeof buildReport>;

