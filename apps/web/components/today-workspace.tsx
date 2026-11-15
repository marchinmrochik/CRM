'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useLocale } from './locale';
import { ErrorNotice, Empty } from './ui';
type Item = {
  id: string;
  applicationId: string;
  title?: string;
  scheduledAt?: string;
  dueAt?: string;
  application: { vacancy: { title: string; company: { name: string } } };
};
export function TodayWorkspace({
  open,
  search,
}: {
  open: (id: string) => void;
  search: () => void;
}) {
  const { t, date } = useLocale();
  const query = useQuery({
    queryKey: ['today'],
    queryFn: () =>
      api<{ actions: Item[]; interviews: Item[]; unseen: number; drafts: number }>('today'),
    refetchInterval: 60000,
  });
  return (
    <section className="panel today-panel">
      <div className="section-title">
        <h2>{t('Your focus today')}</h2>
        <button className="button primary" onClick={search}>
          {t('Find your next role')}
        </button>
      </div>
      <ErrorNotice error={query.error} />
      <p>
        {t('Unseen jobs: {count}', { count: String(query.data?.unseen ?? 0) })} ·{' '}
        {t('Draft applications: {count}', { count: String(query.data?.drafts ?? 0) })}
      </p>
      {query.isPending ? (
        <p role="status">{t('Updating results…')}</p>
      ) : (
        <div className="overview-grid">
          {(
            [
              ['Follow-ups', query.data?.actions ?? []],
              ['Upcoming interviews', query.data?.interviews ?? []],
            ] as const
          ).map(([heading, items]) => (
            <section key={heading}>
              <h3>{t(heading)}</h3>
              {items.length ? (
                items.map((item) => (
                  <button
                    className="action-card"
                    key={item.id}
                    onClick={() => open(item.applicationId)}
                  >
                    <span>
                      <strong>{item.title ?? item.application.vacancy.title}</strong>
                      <small>
                        {item.application.vacancy.company.name} · {item.application.vacancy.title}
                      </small>
                    </span>
                    <span
                      className={
                        new Date(item.dueAt ?? item.scheduledAt!) < new Date() ? 'overdue' : 'muted'
                      }
                    >
                      {date(item.dueAt ?? item.scheduledAt)}
                    </span>
                  </button>
                ))
              ) : (
                <Empty title={t('Nothing needs attention here')}>
                  {t('Your upcoming actions')}
                </Empty>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
