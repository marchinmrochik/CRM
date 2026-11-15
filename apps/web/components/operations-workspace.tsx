'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Draft, Requirement } from '../lib/resume';
import { ErrorNotice, Form, Dialog } from './ui';
import { useLocale } from './locale';

export interface Run {
  id: string;
  kind: string;
  targetId: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  errorCode: string | null;
  errorReason: string | null;
  retryable: boolean;
  output?: {
    imported?: number;
    added?: number;
    changed?: number;
    unchanged?: number;
    versionId?: string;
    requirements?: Requirement[];
    suggestions?: { id: string; factId: string; before: string; after: string; reason: string }[];
  };
  decisions?: Record<string, { decision: string; at: string }>;
  attempts?: {
    id: string;
    number: number;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    heartbeatAt: string;
    workerId: string;
    trigger: string;
    requestedBy: string;
    errorCode: string | null;
    errorReason: string | null;
  }[];
}
interface OperationsHealth {
  worker: string;
  redis: string;
  ai: string;
  workerInstance: string | null;
  workerStartedAt: string | null;
  workerHeartbeatAt: string | null;
}
const titles: Record<string, string> = {
  pdf_publish: 'PDF publication',
  ai_analysis: 'Resume analysis',
  diagnostic: 'Worker diagnostic',
  source_import: 'Source import',
};
export function RunDetail({ id, onVersion }: { id: string; onVersion?: (id: string) => void }) {
  const { t, date } = useLocale();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['operation', id],
    queryFn: () => api<Run>(`operations/${id}`),
    refetchInterval: 2000,
  });
  const run = query.data;
  return (
    <section className="panel operation-detail" aria-live="polite">
      <ErrorNotice error={query.error} />
      {run ? (
        <>
          <div className="section-title">
            <h3>{t(titles[run.kind] ?? run.kind)}</h3>
            <span className={`badge operation-${run.status}`}>{t(run.status)}</span>
          </div>
          <p>{t('Attempts: {count} / {max}', { count: run.attemptCount, max: run.maxAttempts })}</p>
          {run.status === 'retrying' && (
            <p className="muted">{t('Next attempt: {date}', { date: date(run.nextAttemptAt) })}</p>
          )}
          {run.errorCode && (
            <p className="operation-error">
              <strong>{run.errorCode}</strong> · {t(run.errorReason ?? '')}
            </p>
          )}
          {run.status === 'failed' && run.retryable && run.maxAttempts < 30 && (
            <Form
              submit={t('Retry operation')}
              onSubmit={() => api(`operations/${id}/retry`, {})}
              onDone={() => void client.invalidateQueries({ queryKey: ['operation', id] })}
            />
          )}
          {run.output?.versionId && onVersion && (
            <button
              type="button"
              className="button primary resume-navigation"
              onClick={() => onVersion(run.output!.versionId!)}
            >
              {t('View published version')}
            </button>
          )}
          {run.output?.imported !== undefined && (
            <p>
              {t('Imported: {total} · New: {added} · Updated: {changed} · Unchanged: {unchanged}', {
                total: run.output.imported,
                added: run.output.added ?? 0,
                changed: run.output.changed ?? 0,
                unchanged: run.output.unchanged ?? 0,
              })}
            </p>
          )}
          <h4>{t('Attempt history')}</h4>
          {!run.attempts?.length && (
            <p className="muted">{t('Waiting for worker. The task is stored safely.')}</p>
          )}
          <div className="attempt-list">
            {run.attempts?.map((attempt) => (
              <article key={attempt.id} className="attempt-card">
                <div className="section-title">
                  <strong>{t('Attempt {number}', { number: attempt.number })}</strong>
                  <span className={`badge operation-${attempt.status}`}>{t(attempt.status)}</span>
                </div>
                <p className="muted">
                  {date(attempt.startedAt)} →{' '}
                  {attempt.finishedAt ? date(attempt.finishedAt) : t('In progress')}
                </p>
                <p className="muted">
                  {t(attempt.trigger)} ·{' '}
                  {t(attempt.requestedBy === 'system' ? 'System initiated' : 'Owner initiated')}
                </p>
                <small className="muted">
                  {t('Worker instance: {id}', { id: attempt.workerId })}
                </small>
                {attempt.errorCode && (
                  <p className="operation-error">
                    <strong>{attempt.errorCode}</strong> · {t(attempt.errorReason ?? '')}
                  </p>
                )}
                <small className="muted">
                  {t('Heartbeat: {date}', { date: date(attempt.heartbeatAt) })}
                </small>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p>{t('Loading operation…')}</p>
      )}
    </section>
  );
}
export function OperationsWorkspace() {
  const { t, date, label } = useLocale();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const health = useQuery({
    queryKey: ['operations-health'],
    queryFn: () => api<OperationsHealth>('operations/health'),
    refetchInterval: 5000,
  });
  const runs = useQuery({
    queryKey: ['operations'],
    queryFn: () => api<Run[]>('operations'),
    refetchInterval: 2000,
  });
  const [scenario, setScenario] = useState('healthy');
  return (
    <div className="stack">
      <ErrorNotice error={health.error ?? runs.error} />
      <div className="cards-grid">
        {[
          ['Background worker', health.data?.worker],
          ['Redis', health.data?.redis],
          ['AI provider', health.data?.ai],
        ].map(([name, status]) => (
          <section className="panel" key={name}>
            <h3>{t(name!)}</h3>
            <span className="badge">
              {['healthy', 'unavailable', 'checking'].includes(status ?? 'checking')
                ? label(status ?? 'checking')
                : t(status!)}
            </span>
            {name === 'Background worker' && (
              <p className="muted">
                {t('Started {date}', { date: date(health.data?.workerStartedAt ?? undefined) })}
              </p>
            )}
          </section>
        ))}
      </div>
      <section className="panel">
        <h3>{t('Check background processing')}</h3>
        <p className="muted">{t('Synthetic checks contain no resume data and do not call AI.')}</p>
        <Form
          submit={t('Run diagnostic')}
          onSubmit={async () => {
            const run = await api<Run>('operations/check', { scenario });
            setSelected(run.id);
            await client.invalidateQueries({ queryKey: ['operations'] });
          }}
        >
          <select
            aria-label={t('Diagnostic scenario')}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {[
              ['healthy', 'Successful check'],
              ['transient', 'Transient failure then recovery'],
              ['exhausted', 'Exhaust retries, then retry manually'],
              ['permanent', 'Permanent failure'],
              ['slow', 'Slow check for recovery testing'],
            ].map(([value, title]) => (
              <option key={value} value={value}>
                {t(title)}
              </option>
            ))}
          </select>
        </Form>
      </section>
      {selected && <RunDetail id={selected} />}
      <section className="panel">
        <h3>{t('Recent operations')}</h3>
        <p className="muted">
          {t('Failures remain in attempt history after recovery. Showing the latest 100 runs.')}
        </p>
        {!runs.data?.length && <p>{t('No background operations yet.')}</p>}
        <div className="operation-list">
          {runs.data?.map((run) => (
            <button
              type="button"
              key={run.id}
              className="operation-row"
              onClick={() => setSelected(run.id)}
            >
              <span>
                <strong>{t(titles[run.kind] ?? run.kind)}</strong>
                <small>
                  {date(run.createdAt)} ·{' '}
                  {t('Attempts: {count} / {max}', {
                    count: run.attemptCount,
                    max: run.maxAttempts,
                  })}
                </small>
              </span>
              <span className={`badge operation-${run.status}`}>{t(run.status)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
export function DraftOperations({
  draft,
  disabled,
  onVersion,
  publishId,
  onFailure,
}: {
  draft: Draft;
  disabled: boolean;
  onVersion: (id: string) => void;
  publishId: string | null;
  onFailure: () => void;
}) {
  const { t, label } = useLocale();
  const client = useQueryClient();
  const [consent, setConsent] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const health = useQuery({
    queryKey: ['operations-health'],
    queryFn: () => api<OperationsHealth>('operations/health'),
    refetchInterval: 5000,
  });
  const runs = useQuery({
    queryKey: ['operations', draft.id],
    queryFn: () => api<Run[]>(`operations?targetId=${draft.id}`),
    refetchInterval: 2000,
  });
  const relevant = runs.data ?? [];
  const id = publishId ?? selected ?? relevant.find((r) => r.kind === 'ai_analysis')?.id ?? null;
  const run = useQuery({
    queryKey: ['operation', id],
    queryFn: () => api<Run>(`operations/${id}`),
    enabled: !!id,
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (
      publishId &&
      run.data?.id === publishId &&
      run.data.status === 'succeeded' &&
      run.data.output?.versionId
    ) {
      onVersion(run.data.output.versionId);
      void client.invalidateQueries({ queryKey: ['resumes'] });
      void client.invalidateQueries({ queryKey: ['resume-drafts'] });
      void client.invalidateQueries({ queryKey: ['resume-draft', draft.id] });
    } else if (publishId && run.data?.id === publishId && run.data.status === 'failed') {
      setSelected(publishId);
      onFailure();
    }
  }, [publishId, run.data, onVersion, onFailure, client, draft.id]);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['operation', id] }),
      client.invalidateQueries({ queryKey: ['resume-draft', draft.id] }),
    ]);
  };
  return (
    <section className="panel stack">
      <h3>{t('Background tasks and AI suggestions')}</h3>
      <p className="muted">
        {health.data?.ai === 'configured'
          ? t('AI suggests changes. You decide what enters the draft.')
          : t('AI is disabled. Manual tailoring and PDF export remain available.')}
      </p>
      {health.data?.ai === 'configured' && (
        <Form
          submit={t('Analyze saved draft')}
          disabled={disabled}
          onSubmit={async () => {
            const r = await api<Run>(`resume-drafts/${draft.id}/analyze`, {
              revision: draft.revision,
              consent: true,
            });
            setSelected(r.id);
            await client.invalidateQueries({ queryKey: ['operations'] });
          }}
        >
          <label className="check">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t(
              'Send this vacancy and approved resume facts to the configured AI provider. Contact details are omitted.',
            )}
          </label>
        </Form>
      )}
      {disabled && (
        <p className="muted">{t('Save changes before running or accepting analysis.')}</p>
      )}
      {relevant.map((r) => (
        <button
          type="button"
          className="operation-row"
          key={r.id}
          onClick={() => setSelected(r.id)}
        >
          <span>{t(titles[r.kind])}</span>
          <span className={`badge operation-${r.status}`}>{t(r.status)}</span>
        </button>
      ))}
      {id && <RunDetail id={id} onVersion={onVersion} />}
      {run.data?.kind === 'ai_analysis' && run.data.status === 'succeeded' && (
        <>
          <h4>{t('Extracted requirements')}</h4>
          {run.data.output?.requirements?.map((r) => (
            <article className="attempt-card" key={r.id}>
              <p>{r.quote}</p>
              <span className="badge">{label(r.state)}</span>
              <p className="muted">
                {r.factIds
                  .map((id) => draft.profileSnapshot.facts.find((f) => f.id === id)?.title)
                  .join(' · ') || t('No supporting evidence')}
              </p>
            </article>
          ))}
          {!!run.data.output?.requirements?.length && !run.data.decisions?.requirements && (
            <Form
              submit={t('Add reviewed requirements')}
              disabled={disabled}
              onSubmit={() =>
                api(`operations/${id}/requirements`, { revision: draft.revision, reviewed: true })
              }
              onDone={() => void refresh()}
            >
              <label className="check">
                <input type="checkbox" required />
                {t('I reviewed the quoted requirements and their evidence mapping.')}
              </label>
            </Form>
          )}
          {run.data.output?.suggestions?.map((s) => (
            <article className="attempt-card" key={s.id}>
              <h4>{draft.profileSnapshot.facts.find((f) => f.id === s.factId)?.title}</h4>
              <p>{s.reason}</p>
              <div className="diff-grid">
                <div className="diff-before">
                  <small>{t('Before')}</small>
                  <p>{s.before}</p>
                </div>
                <div className="diff-after">
                  <small>{t('After')}</small>
                  <p>{s.after}</p>
                </div>
              </div>
              {run.data?.decisions?.[s.id] ? (
                <span className="badge">
                  {t(
                    run.data.decisions[s.id].decision === 'accepted'
                      ? 'Suggestion accepted'
                      : 'Suggestion rejected',
                  )}
                </span>
              ) : (
                <div className="suggestion-actions">
                  <Form
                    submit={t('Accept suggestion')}
                    disabled={disabled}
                    onSubmit={() =>
                      api(`operations/${id}/suggestions`, {
                        revision: draft.revision,
                        suggestionId: s.id,
                        decision: 'accepted',
                      })
                    }
                    onDone={() => void refresh()}
                  >
                    <label className="check">
                      <input type="checkbox" required />
                      {t('This wording accurately reflects my experience.')}
                    </label>
                  </Form>
                  <Form
                    submit={t('Reject suggestion')}
                    disabled={disabled}
                    onSubmit={() =>
                      api(`operations/${id}/suggestions`, {
                        revision: draft.revision,
                        suggestionId: s.id,
                        decision: 'rejected',
                      })
                    }
                    onDone={() => void refresh()}
                  />
                </div>
              )}
            </article>
          ))}
          {!run.data.output?.suggestions?.length && (
            <p className="muted">{t('No wording suggestions returned.')}</p>
          )}
        </>
      )}
    </section>
  );
}
export function OperationDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Dialog title={t('Operation details')} onClose={onClose}>
      <RunDetail id={id} />
    </Dialog>
  );
}
