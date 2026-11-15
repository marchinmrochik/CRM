'use client';
import { useState } from 'react';
import { milestoneKinds, type Milestone } from '@jobhunt/analytics';
import type { Application } from '../lib/api';
import { api, iso } from '../lib/api';
import { Dialog, Field, Form } from './ui';
import { useLocale } from './locale';
import { milestoneTitles } from './analytics-workspace';
export function MilestoneForm({
  application,
  refresh,
}: {
  application: Application;
  refresh: () => Promise<void>;
}) {
  const { t, date } = useLocale();
  const [voidId, setVoidId] = useState<string | null>(null);
  const voided = new Set(
    application.events.filter((e) => e.type === 'milestone_voided').map((e) => e.metadata?.eventId),
  );
  const recorded = application.events.filter(
    (e) => e.type === 'milestone_recorded' && !voided.has(e.id),
  );
  return (
    <section className="panel">
      <h3>{t('Observed milestones')}</h3>
      <p className="muted">
        {t('Record actual contact and stages. A status change does not prove every funnel step.')}
      </p>
      {recorded.map((event) => (
        <div className="note" key={event.id}>
          <strong>{t(milestoneTitles[event.metadata?.kind as Milestone])}</strong>
          <p>{date(event.occurredAt)}</p>
          <p>{String(event.metadata?.note ?? '')}</p>
          <button className="text-button" onClick={() => setVoidId(event.id)}>
            {t('Correct milestone')}
          </button>
        </div>
      ))}
      {application.submittedAt ? (
        <Form
          key={application.revision}
          submit={t('Record milestone')}
          onSubmit={(data) =>
            api(`applications/${application.id}/milestones`, {
              revision: application.revision,
              kind: data.get('kind'),
              occurredAt: iso(data.get('occurredAt')),
              note: data.get('note'),
            })
          }
          onDone={() => void refresh()}
        >
          <Field label={t('Milestone')}>
            <select name="kind">
              {milestoneKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(milestoneTitles[kind])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Actually occurred at')}>
            <input
              name="occurredAt"
              type="datetime-local"
              required
              defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
            />
          </Field>
          <Field label={t('Evidence note (optional)')}>
            <textarea name="note" maxLength={500} />
          </Field>
        </Form>
      ) : (
        <p>{t('Record submission before adding milestones.')}</p>
      )}
      {voidId && (
        <Dialog title={t('Correct milestone')} onClose={() => setVoidId(null)}>
          <p>
            {t(
              'The original event stays in the timeline. Record a replacement after correction if needed.',
            )}
          </p>
          <Form
            submit={t('Confirm correction')}
            onSubmit={(data) =>
              api(`applications/${application.id}/milestones/${voidId}/void`, {
                revision: application.revision,
                reason: data.get('reason'),
              })
            }
            onDone={() => {
              setVoidId(null);
              void refresh();
            }}
          >
            <Field label={t('Correction reason')}>
              <textarea name="reason" required maxLength={500} />
            </Field>
          </Form>
        </Dialog>
      )}
    </section>
  );
}
