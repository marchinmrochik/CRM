'use client';
import { useQuery } from '@tanstack/react-query';
import { api, Application, Resume, statuses, iso } from '../lib/api';
import { Badge, ErrorNotice, Field, Form } from './ui';
import { useLocale } from './locale';

export function ApplicationDetail({
  id,
  onBack,
  refresh,
}: {
  id: string;
  onBack: () => void;
  refresh: () => Promise<void>;
}) {
  const { t, label, date, event: translateEvent } = useLocale();
  const query = useQuery({
    queryKey: ['application', id],
    queryFn: () => api<Application>(`applications/${id}`),
  });
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<Resume[]>('resumes') });
  const a = query.data;
  if (!a)
    return (
      <>
        <ErrorNotice error={query.error} />
        <p>{query.isPending ? t('Loading application…') : t('Application unavailable.')}</p>
        <button className="button" onClick={onBack}>
          {t('Back to applications')}
        </button>
      </>
    );
  return (
    <>
      <button className="text-button" onClick={onBack}>
        {t('← All applications')}
      </button>
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{a.vacancySnapshot.company}</p>
          <h2>{a.vacancySnapshot.title}</h2>
          <p>
            {t('Created {created} · Submitted {submitted}', {
              created: date(a.createdAt),
              submitted: date(a.submittedAt),
            })}
          </p>
        </div>
        <Badge value={a.status} />
      </div>
      <div className="detail-grid">
        <div className="stack">
          <section className="panel">
            <h3>{t('Update application')}</h3>
            <Form
              key={a.revision}
              submit={t('Update status')}
              onSubmit={(data) =>
                api(`applications/${id}/transition`, {
                  status: data.get('status'),
                  revision: a.revision,
                  reopen: data.get('reopen') === 'on',
                  ...(!a.submittedAt && data.get('status') === 'applied'
                    ? {
                        submittedAt: iso(data.get('submittedAt')),
                        resumeId: data.get('resumeId') || undefined,
                        noResume: data.get('noResume') === 'on',
                      }
                    : {}),
                })
              }
              onDone={() => void refresh()}
            >
              <Field label={t('New status')}>
                <select name="status" defaultValue={a.status}>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {label(s)}
                    </option>
                  ))}
                </select>
              </Field>
              {!a.submittedAt && (
                <>
                  <Field label={t('Submission date (for Applied)')}>
                    <input
                      name="submittedAt"
                      type="datetime-local"
                      defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                        .toISOString()
                        .slice(0, 16)}
                    />
                  </Field>
                  <Field label={t('Resume actually sent')}>
                    <select name="resumeId">
                      <option value="">{t('Select a resume')}</option>
                      {resumes.data?.map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="check">
                    <input type="checkbox" name="noResume" />
                    {t('No resume was used for this application')}
                  </label>
                </>
              )}
              {['accepted', 'rejected', 'withdrawn'].includes(a.status) && (
                <label className="check">
                  <input name="reopen" type="checkbox" />
                  {t('I confirm reopening this application')}
                </label>
              )}
            </Form>
          </section>
          <section className="panel">
            <h3>{t('Submitted document')}</h3>
            {a.resume ? (
              <a className="document" href={`/api/v1/resumes/${a.resume.id}/download`}>
                {a.resume.name} ↓
              </a>
            ) : (
              <p className="muted">
                {a.noResume
                  ? t('Submitted without a resume.')
                  : t(
                      'No document pinned. Upload a PDF in Resumes, then select it when marking Applied.',
                    )}
              </p>
            )}
          </section>
          <section className="panel">
            <h3>{t('Next actions')}</h3>
            {a.actions.map((action) => (
              <div className="item-row" key={action.id}>
                <div>
                  <strong>{action.title}</strong>
                  <small
                    className={
                      !action.completedAt && new Date(action.dueAt) < new Date() ? 'overdue' : ''
                    }
                  >
                    {date(action.dueAt)}
                    {action.completedAt ? t(' · Completed') : ''}
                  </small>
                </div>
                {!action.completedAt && (
                  <Form
                    submit={t('Complete')}
                    onSubmit={() => api(`applications/${id}/actions/${action.id}/complete`, {})}
                    onDone={() => void refresh()}
                  >
                    <span />
                  </Form>
                )}
              </div>
            ))}
            <Form
              submit={t('Add next action')}
              onSubmit={(data) =>
                api(`applications/${id}/actions`, {
                  title: data.get('title'),
                  dueAt: iso(data.get('dueAt')),
                })
              }
              onDone={() => void refresh()}
            >
              <Field label={t('Action')}>
                <input
                  name="title"
                  required
                  placeholder={t('Follow up with recruiter')}
                  maxLength={300}
                />
              </Field>
              <Field label={t('Due date')}>
                <input name="dueAt" type="datetime-local" required />
              </Field>
            </Form>
          </section>
          <section className="panel">
            <h3>{t('Interviews')}</h3>
            {a.interviews.map((interview) => (
              <div className="interview" key={interview.id}>
                <div className="item-row">
                  <strong>{t('{type} interview', { type: label(interview.type) })}</strong>
                  <Badge value={interview.status} />
                </div>
                <p>
                  {date(interview.scheduledAt)} · {interview.timezone}
                </p>
                {interview.outcome && <p>{interview.outcome}</p>}
                {interview.status === 'scheduled' && (
                  <Form
                    submit={t('Save outcome')}
                    onSubmit={(data) =>
                      api(
                        `applications/${id}/interviews/${interview.id}`,
                        { status: data.get('status'), outcome: data.get('outcome') },
                        'PATCH',
                      )
                    }
                    onDone={() => void refresh()}
                  >
                    <div className="form-row">
                      <Field label={t('Result')}>
                        <select name="status">
                          <option value="completed">{t('Completed')}</option>
                          <option value="cancelled">{t('Cancelled')}</option>
                        </select>
                      </Field>
                      <Field label={t('Outcome')}>
                        <input name="outcome" placeholder={t('Feedback or result')} />
                      </Field>
                    </div>
                  </Form>
                )}
              </div>
            ))}
            <Form
              submit={t('Schedule interview')}
              onSubmit={(data) =>
                api(`applications/${id}/interviews`, {
                  type: data.get('type'),
                  scheduledAt: iso(data.get('scheduledAt')),
                  timezone: data.get('timezone'),
                })
              }
              onDone={() => void refresh()}
            >
              <div className="form-row">
                <Field label={t('Interview type')}>
                  <select name="type">
                    <option value="recruiter">{t('Recruiter')}</option>
                    <option value="technical">{t('Technical')}</option>
                    <option value="final">{t('Final')}</option>
                    <option value="other">{t('Other')}</option>
                  </select>
                </Field>
                <Field label={t('Timezone')}>
                  <input
                    name="timezone"
                    defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                    required
                  />
                </Field>
              </div>
              <Field label={t('Scheduled date')}>
                <input name="scheduledAt" type="datetime-local" required />
              </Field>
            </Form>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h3>{t('Activity timeline')}</h3>
            <ol className="timeline">
              {a.events.map((event) => (
                <li key={event.id}>
                  <strong>{translateEvent(event)}</strong>
                  <small>{date(event.occurredAt)}</small>
                  {event.occurredAt !== event.recordedAt && (
                    <small>{t('Recorded {date}', { date: date(event.recordedAt) })}</small>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h3>{t('Notes')}</h3>
            {a.notes.map((note) => (
              <div key={note.id} className="note">
                <p>{note.content}</p>
                <small>{date(note.createdAt)}</small>
              </div>
            ))}
            <Form
              submit={t('Add note')}
              onSubmit={(data) => api(`applications/${id}/notes`, { content: data.get('content') })}
              onDone={() => void refresh()}
            >
              <Field label={t('Note')}>
                <textarea
                  name="content"
                  required
                  placeholder={t('Capture feedback, context, or a conversation…')}
                  maxLength={10000}
                />
              </Field>
            </Form>
          </section>
          <section className="panel">
            <h3>{t('Original vacancy snapshot')}</h3>
            <p className="muted">{t('Captured when this application was created.')}</p>
            <p className="description">{a.vacancySnapshot.description}</p>
            {a.vacancySnapshot.url && (
              <a href={a.vacancySnapshot.url} target="_blank" rel="noreferrer">
                {t('Open original listing ↗')}
              </a>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
