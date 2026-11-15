'use client';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Empty, ErrorNotice, Field, Form } from './ui';
import { useLocale } from './locale';
import { RunDetail } from './operations-workspace';

type Filters = {
  keywords: string;
  location: string;
  company: string;
  postedWithin: string;
  sort: string;
  connector: string;
  disposition: string;
  unseen: boolean;
};
type Listing = {
  id: string;
  title: string;
  company: string;
  connector: string;
  location: string;
  url: string;
  description?: string;
  disposition: string;
  seenAt: string | null;
  promotedVacancyId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  publishedAt: string | null;
  reasons: string[];
  duplicateCandidates: number;
  snapshots?: {
    id: string;
    capturedAt: string;
    content: { description: string; title: string; location: string };
  }[];
  duplicates?: { id: string; connector: string; url: string }[];
};
type Feed = {
  connector: string;
  name: string;
  website: string;
  coverage: string;
  intervalHours: number;
  enabled: boolean;
  nextFetchAt: string;
  lastSuccessAt: string | null;
  health: string;
  lastRun: {
    id: string;
    status: string;
    errorCode: string | null;
    errorReason: string | null;
    nextAttemptAt: string;
  } | null;
};
const initial: Filters = {
  keywords: '',
  location: '',
  company: '',
  postedWithin: '',
  sort: 'published',
  connector: '',
  disposition: '',
  unseen: false,
};
const sourceName = (connector: string) =>
  ({
    remotive: 'Remotive',
    arbeitnow: 'Arbeitnow',
    jobicy: 'Jobicy',
    himalayas: 'Himalayas',
    remoteok: 'Remote OK',
  })[connector] ?? connector;

export function DiscoverySources() {
  const { t, date } = useLocale(),
    client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const sources = useQuery({
    queryKey: ['discovery-sources'],
    queryFn: () => api<Feed[]>('discovery/sources'),
    refetchInterval: 5000,
  });
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await client.invalidateQueries({ queryKey: ['discovery-sources'] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t('Action failed.')));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="discovery-sources">
      <h2>{t('Connected sources')}</h2>
      <p className="muted">
        {t(
          'Monitoring is optional. Each source has its own request interval; retries respect it too.',
        )}
      </p>
      <ErrorNotice error={error ?? sources.error} />
      <div className="cards-grid">
        {sources.data?.map((source) => (
          <section className="panel" key={source.connector}>
            <div className="section-title">
              <h3>{source.name}</h3>
              <Badge value={source.health} />
            </div>
            <p>{t(source.coverage)}</p>
            <p className="muted">{t('Next fetch: {date}', { date: date(source.nextFetchAt) })}</p>
            <p className="muted">
              {t('Last success: {date}', { date: date(source.lastSuccessAt ?? undefined) })}
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={source.enabled}
                disabled={busy}
                onChange={(e) =>
                  void act(() =>
                    api(
                      `discovery/sources/${source.connector}`,
                      { enabled: e.target.checked },
                      'PATCH',
                    ),
                  )
                }
              />
              {t('Monitor every {hours} hours', { hours: String(source.intervalHours) })}
            </label>
            <div className="discovery-actions">
              <button
                className="button primary"
                disabled={busy || new Date(source.nextFetchAt) > new Date()}
                onClick={() =>
                  void act(async () => {
                    const run = await api<{ id: string }>(
                      `discovery/sources/${source.connector}/import`,
                      {},
                    );
                    setSelected(run.id);
                  })
                }
              >
                {t('Import now')}
              </button>
              {source.lastRun && (
                <button className="button" onClick={() => setSelected(source.lastRun!.id)}>
                  {t('Inspect import')} · {t(source.lastRun.status)}
                </button>
              )}
              <a className="button" href={source.website} target="_blank" rel="noreferrer">
                {t('Open job board')}
              </a>
            </div>
            {source.lastRun?.errorCode && (
              <p role="status">
                {source.lastRun.errorCode}: {t(source.lastRun.errorReason ?? '')}
              </p>
            )}
          </section>
        ))}
      </div>
      {selected && <RunDetail id={selected} />}
    </section>
  );
}

export function DiscoveryWorkspace({
  onPromoted,
}: {
  onPromoted: (id: string, action: 'application' | 'resume' | 'saved') => void;
}) {
  const { t, date } = useLocale(),
    client = useQueryClient();
  const readSearch = () => {
    const p = new URLSearchParams(typeof window === 'undefined' ? '' : location.search);
    return {
      ...initial,
      ...Object.fromEntries(
        Object.keys(initial)
          .filter((k) => p.has('job_' + k))
          .map((k) => [k, p.get('job_' + k)]),
      ),
      unseen: p.get('job_unseen') === 'true',
    } as Filters;
  };
  const [filters, setFilters] = useState<Filters>(readSearch),
    [page, setPage] = useState(
      () =>
        Number(
          new URLSearchParams(typeof window === 'undefined' ? '' : location.search).get('job_page'),
        ) || 1,
    ),
    [selected, setSelected] = useState<string | null>(() =>
      new URLSearchParams(typeof window === 'undefined' ? '' : location.search).get('listing'),
    ),
    [snapshot, setSnapshot] = useState<string>(''),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  const [queryFilters, setQueryFilters] = useState(filters);
  useEffect(() => {
    const timer = setTimeout(() => setQueryFilters(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== initial[key as keyof Filters]) p.set('job_' + key, String(value));
      else p.delete('job_' + key);
    });
    p.set('job_page', String(page));
    if (selected) p.set('listing', selected);
    else p.delete('listing');
    history.replaceState({}, '', `?${p}`);
    sessionStorage.setItem('jobhunt.last-search', `?${p}`);
  }, [filters, page, selected]);
  useEffect(() => {
    const sync = () => {
      setFilters(readSearch());
      const p = new URLSearchParams(location.search);
      setPage(Number(p.get('job_page')) || 1);
      setSelected(p.get('listing'));
    };
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  const params = new URLSearchParams({
    ...queryFilters,
    unseen: String(queryFilters.unseen),
    page: String(page),
  });
  const listings = useQuery({
    queryKey: ['discovery-listings', params.toString()],
    queryFn: () =>
      api<{ items: Listing[]; total: number; page: number }>(`discovery/listings?${params}`),
    refetchInterval: 10000,
    placeholderData: (previous) => previous,
  });
  const searches = useQuery({
    queryKey: ['discovery-searches'],
    queryFn: () => api<{ id: string; name: string; filters: Filters }[]>('discovery/searches'),
  });
  const sources = useQuery({
    queryKey: ['discovery-sources'],
    queryFn: () => api<Feed[]>('discovery/sources'),
  });
  const detail = useQuery({
    queryKey: ['discovery-detail', selected],
    queryFn: () => api<Listing>(`discovery/listings/${selected}`),
    enabled: !!selected,
  });
  const update = (patch: Partial<Filters>) => {
    setFilters((old) => ({ ...old, ...patch }));
    setPage(1);
  };
  async function act(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await Promise.all(
        [
          'discovery-listings',
          'discovery-searches',
          'discovery-detail',
          'vacancies',
          'companies',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(t('Action failed.')));
    } finally {
      setBusy(false);
    }
  }
  const item = detail.data;
  const version = item?.snapshots?.find((s) => s.id === snapshot);
  return (
    <>
      <div className="info-banner">
        {t(
          'Remote does not prove work eligibility. Verify geography and hiring conditions before applying.',
        )}
      </div>
      <p className="muted">
        {t(
          'Search imported listings locally. To fetch new jobs, open Sources. Feed coverage is limited; the original page is authoritative.',
        )}
      </p>
      <ErrorNotice
        error={error ?? listings.error ?? searches.error ?? sources.error ?? detail.error}
      />
      <section className="panel discovery-filters daily-search">
        <div className="form-grid">
          <Field label={t('Keywords (all words)')}>
            <input
              value={filters.keywords}
              onChange={(e) => update({ keywords: e.target.value })}
              maxLength={150}
            />
          </Field>
          <Field label={t('Location text')}>
            <input
              value={filters.location}
              onChange={(e) => update({ location: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field label={t('Source')}>
            <select
              value={filters.connector}
              onChange={(e) => update({ connector: e.target.value })}
            >
              <option value="">{t('All sources')}</option>
              {sources.data?.map((source) => (
                <option key={source.connector} value={source.connector}>
                  {source.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Sort results')}>
            <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
              <option value="published">{t('Newest publications')}</option>
              <option value="imported">{t('Recently imported')}</option>
            </select>
          </Field>
          <Field label={t('Company name')}>
            <input
              value={filters.company}
              onChange={(e) => update({ company: e.target.value })}
              maxLength={100}
            />
          </Field>
          <Field label={t('Published within')}>
            <select
              value={filters.postedWithin}
              onChange={(e) => update({ postedWithin: e.target.value })}
            >
              <option value="">{t('Any date')}</option>
              {['7', '30', '90'].map((days) => (
                <option key={days} value={days}>
                  {t('Last {days} days', { days })}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Disposition')}>
            <select
              value={filters.disposition}
              onChange={(e) => update({ disposition: e.target.value })}
            >
              <option value="">{t('All')}</option>
              {['inbox', 'shortlisted', 'dismissed'].map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={filters.unseen}
            onChange={(e) => update({ unseen: e.target.checked })}
          />
          {t('Unseen only')}
        </label>
        <button
          className="button"
          onClick={() => {
            setFilters(initial);
            setPage(1);
            setSelected(null);
          }}
        >
          {t('Reset filters')}
        </button>
        <details className="saved-search-settings">
          <summary>{t('Save search')}</summary>
          <Form
            submit={t('Save search')}
            onSubmit={async (data) => {
              await api('discovery/searches', { name: data.get('name'), filters });
              await client.invalidateQueries({ queryKey: ['discovery-searches'] });
            }}
          >
            <Field label={t('Search name')}>
              <input name="name" required maxLength={80} />
            </Field>
          </Form>
        </details>
        <div className="discovery-actions">
          {searches.data?.map((search) => (
            <span className="saved-search" key={search.id}>
              <button
                className="button"
                onClick={() => {
                  setFilters({ ...initial, ...search.filters });
                  setPage(1);
                }}
              >
                {search.name}
              </button>
              <button
                className="button"
                disabled={busy}
                aria-label={t('Delete search: {name}', { name: search.name })}
                onClick={() => void act(() => api(`discovery/searches/${search.id}`, {}, 'DELETE'))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
      <div className="section-title">
        <h2>{t('Imported vacancies')}</h2>
        <span>{t('{count} opportunities', { count: String(listings.data?.total ?? 0) })}</span>
      </div>
      {(listings.isFetching || filters !== queryFilters) && (
        <p role="status" className="muted">
          {t('Updating results…')}
        </p>
      )}
      {!listings.isPending && !listings.data?.items.length && (
        <Empty title={t('No matching opportunities')}>
          {t('Import a source or change your saved filters.')}
        </Empty>
      )}
      <div className="discovery-layout">
        <div className="discovery-list">
          {listings.data?.items.map((row) => (
            <button
              key={row.id}
              className={`panel discovery-row ${selected === row.id ? 'is-selected' : ''}`}
              onClick={() => {
                setSelected(row.id);
                setSnapshot('');
              }}
            >
              <strong>{row.title}</strong>
              <span>
                {row.company} · {sourceName(row.connector)}
              </span>
              <span className="discovery-location" title={row.location}>
                {row.location}
              </span>
              <small>{t('Published: {date}', { date: date(row.publishedAt ?? undefined) })}</small>
              <span className="muted">
                {t('Eligibility unknown')} · {row.seenAt ? t('Seen') : t('New')}
              </span>
              <Badge value={row.disposition} />
              {row.reasons.map((reason) => (
                <small key={reason}>
                  {reason.startsWith('Keyword: ')
                    ? t('Keyword match: {value}', { value: reason.slice(9) })
                    : t('Location match: {value}', { value: reason.slice(10) })}
                </small>
              ))}
              {!!row.duplicateCandidates && (
                <small>
                  {t('Possible duplicates: {count}', { count: String(row.duplicateCandidates) })}
                </small>
              )}
            </button>
          ))}
        </div>
        {item && (
          <section className="panel discovery-detail">
            <h2>{item.title}</h2>
            <p>
              {item.company} · {sourceName(item.connector)}
            </p>
            <p>
              {item.location} · {t('Eligibility unknown')}
            </p>
            <a className="button" href={item.url} target="_blank" rel="noreferrer">
              {t('View original at {source}', { source: sourceName(item.connector) })}
            </a>
            <p className="muted">
              {t('Published: {date}', { date: date(item.publishedAt ?? undefined) })} ·{' '}
              {t('First seen: {date}', { date: date(item.firstSeenAt) })} ·{' '}
              {t('Last seen: {date}', { date: date(item.lastSeenAt) })}
            </p>
            <a
              href={sources.data?.find((s) => s.connector === item.connector)?.website}
              target="_blank"
              rel="noreferrer"
            >
              {t('Data from {source}', { source: sourceName(item.connector) })}
            </a>
            <div className="discovery-actions">
              {['seen', 'shortlisted', 'dismissed', 'inbox'].map((action) => (
                <button
                  className="button"
                  key={action}
                  disabled={busy}
                  onClick={() =>
                    void act(() => api(`discovery/listings/${item.id}/decision`, { action }))
                  }
                >
                  {t(
                    {
                      seen: 'Mark seen',
                      shortlisted: 'Shortlist',
                      dismissed: 'Dismiss',
                      inbox: 'Return to inbox',
                    }[action]!,
                  )}
                </button>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const saved = await api<{ vacancyId: string }>(
                    `discovery/listings/${item.id}/promote`,
                    {},
                  );
                  onPromoted(saved.vacancyId, 'saved');
                })
              }
            >
              {t(item.promotedVacancyId ? 'Open saved vacancies' : 'Save to CRM')}
            </button>
            <div className="discovery-actions">
              {(['application', 'resume'] as const).map((action) => (
                <button
                  className="button primary"
                  key={action}
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const saved = await api<{ vacancyId: string }>(
                        `discovery/listings/${item.id}/promote`,
                        {},
                      );
                      await client.invalidateQueries({ queryKey: ['vacancies'] });
                      onPromoted(saved.vacancyId, action);
                    })
                  }
                >
                  {t(action === 'application' ? 'Prepare application' : 'Create tailored resume')}
                </button>
              ))}
            </div>
            {!!item.duplicates?.length && (
              <div className="info-banner">
                <p>{t('Similar title and company. Review before creating another application.')}</p>
                {item.duplicates.map((d) => (
                  <button
                    key={d.id}
                    className="button"
                    onClick={() => {
                      setSelected(d.id);
                      setSnapshot('');
                    }}
                  >
                    {sourceName(d.connector)}
                  </button>
                ))}
              </div>
            )}
            <Field label={t('Source snapshot')}>
              <select value={snapshot} onChange={(e) => setSnapshot(e.target.value)}>
                <option value="">{t('Latest imported description')}</option>
                {item.snapshots?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {date(s.capturedAt)}
                  </option>
                ))}
              </select>
            </Field>
            {version && (
              <p>
                {version.content.title} · {version.content.location}
              </p>
            )}
            <div className="discovery-description">
              {version?.content.description ?? item.description}
            </div>
          </section>
        )}
      </div>
      <div className="discovery-actions">
        <button className="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          {t('Previous')}
        </button>
        <span>{t('Page {page}', { page: String(page) })}</span>
        <button
          className="button"
          disabled={page * 20 >= (listings.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          {t('Next')}
        </button>
      </div>
    </>
  );
}
