'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AnalyticsReport, CohortFilters, Milestone } from '@jobhunt/analytics';
import { api } from '../lib/api';
import { Empty, ErrorNotice, Field } from './ui';
import { useLocale } from './locale';
export const milestoneTitles: Record<Milestone, string> = {
  recruiter_response: 'Recruiter response',
  human_interaction: 'Human interaction',
  interview: 'Interview attended',
  final_interview: 'Final interview attended',
  offer: 'Offer received',
};
export type Report = AnalyticsReport & {
  operations?: {
    states: { status: string; count: number }[];
    failedAttempts: number;
    recoveredRuns: number;
    errorCodes: { code: string | null; count: number }[];
  };
  serviceHealth?: { worker: string; redis: string; ai: string };
};
export function AnalyticsWorkspace({
  onApplication,
  onResume,
}: {
  onApplication: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const [filters, setFilters] = useState<CohortFilters>({});
  const [lastReport, setLastReport] = useState<Report | null>(null);
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const report = useQuery({
    queryKey: ['analytics', params.toString()],
    queryFn: () => api<Report>(`analytics?${params}`),
  });
  const { t } = useLocale();
  useEffect(() => {
    if (report.data) setLastReport(report.data);
  }, [report.data]);
  const displayed = report.data ?? lastReport;
  return (
    <>
      <ErrorNotice error={report.error} />
      {displayed && (report.isFetching || report.error) && (
        <p className="muted" role="status">
          {t('Showing the last loaded cohort until valid filters finish loading.')}
        </p>
      )}
      {displayed ? (
        <AnalyticsPanel
          report={displayed}
          filters={filters}
          onFilters={setFilters}
          onApplication={onApplication}
          onResume={onResume}
          exportUrl={
            report.data && !report.isFetching ? `/api/v1/analytics/export?${params}` : undefined
          }
        />
      ) : (
        <p>{t('Loading analytics…')}</p>
      )}
    </>
  );
}
export function AnalyticsPanel({
  report,
  filters,
  onFilters,
  onApplication,
  onResume,
  exportUrl,
}: {
  report: Report;
  filters: CohortFilters;
  onFilters: (value: CohortFilters) => void;
  onApplication: (id: string) => void;
  onResume?: (id: string) => void;
  exportUrl?: string;
}) {
  const { t, date, label } = useLocale();
  const percent = (value: number | null) => (value === null ? '—' : `${value}%`);
  const duration = (hours: number | null) =>
    hours === null ? '—' : t('{days} days', { days: (hours / 24).toFixed(1) });
  const change = (patch: CohortFilters) => onFilters({ ...filters, ...patch });
  const compare = (
    groups: AnalyticsReport['sources'],
    title: string,
    kind: 'source' | 'resumeKey',
  ) => (
    <section className="panel">
      <h2>{t(title)}</h2>
      <div className="table-scroll" role="region" aria-label={t(title)} tabIndex={0}>
        <table className="analytics-table">
          <caption className="muted">
            {t(
              'Observed outcomes; differences do not prove causation. Small sample means fewer than five submissions.',
            )}
          </caption>
          <thead>
            <tr>
              {[
                'Group',
                'Submitted',
                'Responses',
                'Interviews',
                'Offers',
                'Unresolved',
                'Median response',
              ].map((h) => (
                <th key={h} scope="col">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.key}>
                <th scope="row">
                  <button className="text-button" onClick={() => change({ [kind]: group.key })}>
                    {['no-resume', 'not-recorded'].includes(group.key) ||
                    (kind === 'source' && group.key === 'Manual')
                      ? t(group.label)
                      : group.label}
                  </button>
                  {group.smallSample && (
                    <small className="analytics-caution">{t('Small sample')}</small>
                  )}
                </th>
                <td>{group.submitted}</td>
                {['recruiter_response', 'interview', 'offer'].map((k) => {
                  const stage = group.stages.find((s) => s.kind === k)!;
                  return (
                    <td key={k}>
                      {stage.count}/{group.submitted} · {percent(stage.percent)}
                    </td>
                  );
                })}
                <td>{group.unresolved}</td>
                <td>
                  {duration(group.responseTime.medianHours)}{' '}
                  <small>n={group.responseTime.sample}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="analytics-workspace">
      <section className="panel analytics-filters">
        <div className="form-grid">
          <Field label={t('Submitted from (UTC)')}>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => change({ from: e.target.value })}
            />
          </Field>
          <Field label={t('Submitted through (UTC)')}>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => change({ to: e.target.value })}
            />
          </Field>
          <Field label={t('Captured source')}>
            <select
              value={filters.source ?? ''}
              onChange={(e) => change({ source: e.target.value })}
            >
              <option value="">{t('All sources')}</option>
              {report.dimensions.sources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Submitted resume')}>
            <select
              value={filters.resumeKey ?? ''}
              onChange={(e) => change({ resumeKey: e.target.value })}
            >
              <option value="">{t('All resumes')}</option>
              {report.dimensions.resumes.map((resume) => (
                <option key={resume.key} value={resume.key}>
                  {['no-resume', 'not-recorded'].includes(resume.key)
                    ? t(resume.label)
                    : resume.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="discovery-actions">
          <button className="button" onClick={() => onFilters({})}>
            {t('Reset cohort')}
          </button>
          {exportUrl && (
            <a className="button" href={exportUrl}>
              {t('Export analytics JSON')}
            </a>
          )}
          <span className="muted">{t('As of {date}', { date: date(report.asOf) })}</span>
        </div>
      </section>
      <div className="info-banner">
        {t(
          'Submission cohort. Drafts are excluded. Missing responses are not rejections; later stages do not fill missing earlier evidence.',
        )}
      </div>
      <div className="stats-grid">
        {[
          { name: 'Submitted', count: report.submitted },
          { name: 'Unresolved', count: report.unresolved },
          { name: 'No recorded response', count: report.noRecordedResponse },
          {
            name: 'Historical offers',
            count: report.stages.find((s) => s.kind === 'offer')!.count,
          },
        ].map((s) => (
          <div className="stat-card" key={s.name}>
            <span>{t(s.name)}</span>
            <strong>{s.count}</strong>
          </div>
        ))}
      </div>
      {!report.submitted && (
        <Empty title={t('No submitted applications in this cohort')}>
          {t('Change the date filters or record a submission first.')}
        </Empty>
      )}
      <section className="panel">
        <h2>{t('Observed conversion')}</h2>
        <div
          className="table-scroll"
          role="region"
          aria-label={t('Observed conversion')}
          tabIndex={0}
        >
          <table className="analytics-table">
            <caption>
              {t(
                'Each stage counts an application once. Conditional conversion requires evidence for both adjacent stages.',
              )}
            </caption>
            <thead>
              <tr>
                {[
                  'Milestone',
                  'Of submitted cohort',
                  'From previous stage',
                  'Missing earlier evidence',
                ].map((h) => (
                  <th key={h} scope="col">
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t('Application submitted')}</th>
                <td>
                  {report.submitted}/{report.submitted} · {percent(report.submitted ? 100 : null)}
                </td>
                <td>—</td>
                <td>—</td>
              </tr>
              {report.stages.map((stage) => (
                <tr key={stage.kind}>
                  <th scope="row">{t(milestoneTitles[stage.kind])}</th>
                  <td>
                    <span className="analytics-bar" aria-hidden="true">
                      <span style={{ width: `${stage.percent ?? 0}%` }} />
                    </span>
                    {stage.count}/{stage.denominator} · {percent(stage.percent)}
                  </td>
                  <td>
                    {stage.transition.count}/{stage.transition.denominator} ·{' '}
                    {percent(stage.transition.percent)}
                  </td>
                  <td>{stage.missingEarlierEvidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="cards-grid">
        <section className="panel">
          <h2>{t('Response timing')}</h2>
          <p>{t('Median: {duration}', { duration: duration(report.responseTime.medianHours) })}</p>
          <p>
            {t('90th percentile: {duration}', { duration: duration(report.responseTime.p90Hours) })}
          </p>
          <p className="muted">
            {t('Recorded response sample: {count}', { count: report.responseTime.sample })}
          </p>
          <p>{t('Unanswered applications do not enter response-time calculations.')}</p>
        </section>
        <section className="panel">
          <h2>{t('Current outcomes')}</h2>
          <p>
            {t('Accepted')}: {report.accepted} · {t('Rejected')}: {report.rejected} ·{' '}
            {t('Withdrawn')}: {report.withdrawn}
          </p>
          <p>
            {t('Reopened applications')}: {report.reopened}
          </p>
          <p>
            {t(
              'Unresolved age: ≤7 days {week}, 8–30 days {month}, over 30 days {older}',
              report.unresolvedAge,
            )}
          </p>
          <p className="muted">
            {t('Invalid or out-of-range evidence excluded: {count}', {
              count: report.evidenceIssues,
            })}
          </p>
        </section>
      </div>
      {compare(report.sources, 'Source comparison', 'source')}
      {compare(report.resumes, 'Resume comparison', 'resumeKey')}
      <section className="panel">
        <h2>{t('Cohort applications')}</h2>
        <p className="muted">
          {t('Showing {shown} of {total}; aggregates use the full cohort.', {
            shown: report.applications.length,
            total: report.submitted,
          })}
        </p>
        <div
          className="table-scroll"
          role="region"
          aria-label={t('Cohort applications')}
          tabIndex={0}
        >
          <table className="analytics-table">
            <thead>
              <tr>
                {['Application', 'Submitted', 'Status', 'Observed stages', 'Submitted resume'].map(
                  (h) => (
                    <th key={h} scope="col">
                      {t(h)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {report.applications.map((app) => (
                <tr key={app.id}>
                  <th scope="row">
                    <button className="text-button" onClick={() => onApplication(app.id)}>
                      {app.title}
                    </button>
                    <small>
                      {app.company} · {app.source}
                    </small>
                  </th>
                  <td>{date(app.submittedAt ?? undefined)}</td>
                  <td>{label(app.status)}</td>
                  <td>
                    {Object.keys(app.evidence.milestones)
                      .map((k) => t(milestoneTitles[k as Milestone]))
                      .join(' · ') || '—'}
                  </td>
                  <td>
                    {app.resumeVersionId && onResume ? (
                      <button
                        className="text-button"
                        onClick={() => onResume(app.resumeVersionId!)}
                      >
                        {app.resumeLabel}
                      </button>
                    ) : ['no-resume', 'not-recorded'].includes(app.resumeKey) ? (
                      t(app.resumeLabel)
                    ) : (
                      app.resumeLabel
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {report.operations && (
        <section className="panel">
          <h2>{t('Operational summary')}</h2>
          <p className="muted">
            {t('Operations use run creation dates, independently of the application cohort.')}
          </p>
          <div className="discovery-actions">
            {report.operations.states.map((s) => (
              <span key={s.status}>
                {t(s.status)}: {s.count}
              </span>
            ))}
          </div>
          <p>
            {t('Failed attempts: {failed} · Runs recovered to success: {recovered}', {
              failed: report.operations.failedAttempts,
              recovered: report.operations.recoveredRuns,
            })}
          </p>
          {report.operations.errorCodes.map((e) => (
            <p key={e.code}>
              {e.code ?? t('Unknown')}: {e.count}
            </p>
          ))}
          {report.serviceHealth && (
            <p>
              {t('Worker')}: {t(report.serviceHealth.worker)} · Redis:{' '}
              {t(report.serviceHealth.redis)} · AI: {t(report.serviceHealth.ai)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
