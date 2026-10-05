'use client';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  LayoutDashboard,
  Building2,
  FileText,
  Radio,
  Activity,
  Search,
  Plus,
  ArrowUpRight,
  LogOut,
  ChevronRight,
  Layers3,
} from 'lucide-react';
import {
  api,
  Application,
  Company,
  Vacancy,
  List,
  Overview,
  Health,
  Source,
  Resume,
  statuses,
} from '../lib/api';
import { Badge, Dialog, Empty, ErrorNotice, Field, Form } from './ui';
import { ApplicationDetail } from './application-detail';
import { LocaleProvider, LanguagePicker, useLocale } from './locale';

const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'applications', label: 'Applications', icon: BriefcaseBusiness },
  { id: 'vacancies', label: 'Vacancies', icon: Layers3 },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'resumes', label: 'Resumes', icon: FileText },
  { id: 'sources', label: 'Sources', icon: Radio },
  { id: 'system', label: 'System activity', icon: Activity },
];
const subtitles: Record<string, string> = {
  overview: 'A clear view of your next opportunity.',
  applications: 'Every application. Every conversation. One place.',
  vacancies: 'Keep the opportunities worth exploring.',
  companies: 'The people and teams behind your next role.',
  resumes: 'Keep a record of exactly what you sent.',
  sources: 'Broaden your search, one source at a time.',
  system: 'Know what is running and what needs attention.',
};

export default function WorkspaceRoot() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <LocaleProvider>
      <QueryClientProvider client={client}>
        <Workspace />
      </QueryClientProvider>
    </LocaleProvider>
  );
}
function Workspace() {
  const { t, date, label, known } = useLocale();
  const client = useQueryClient();
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<{ authenticated: boolean }>('auth/me'),
  });
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'company' | 'vacancy' | null>(null);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [editVacancy, setEditVacancy] = useState<Vacancy | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<Error | null>(null);
  const enabled = auth.data?.authenticated === true;
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(location.search);
      setView(p.get('view') ?? 'overview');
      setSelected(p.get('application'));
      setQ(p.get('q') ?? '');
      setStatus(p.get('status') ?? '');
      setPage(Number(p.get('page')) || 1);
    };
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  function navigate(next: string, application?: string) {
    setView(next);
    setSelected(application ?? null);
    setNotice(null);
    setQ('');
    setStatus('');
    setPage(1);
    const params = new URLSearchParams({ view: next });
    if (application) params.set('application', application);
    history.pushState({}, '', `?${params}`);
  }
  function filter(nextQ: string, nextStatus: string, nextPage = 1) {
    setQ(nextQ);
    setStatus(nextStatus);
    setPage(nextPage);
    const params = new URLSearchParams({
      view: 'applications',
      q: nextQ,
      status: nextStatus,
      page: String(nextPage),
    });
    history.replaceState({}, '', `?${params}`);
  }
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<Company[]>('companies'),
    enabled,
  });
  const vacancies = useQuery({
    queryKey: ['vacancies'],
    queryFn: () => api<Vacancy[]>('vacancies'),
    enabled,
  });
  const applications = useQuery({
    queryKey: ['applications', q, status, page],
    queryFn: () =>
      api<List>(`applications?q=${encodeURIComponent(q)}&status=${status}&page=${page}`),
    enabled,
  });
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('overview'),
    enabled,
  });
  const resumes = useQuery({
    queryKey: ['resumes'],
    queryFn: () => api<Resume[]>('resumes'),
    enabled,
  });
  const sources = useQuery({
    queryKey: ['sources'],
    queryFn: () => api<Source[]>('sources'),
    enabled,
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('health/ready'),
    enabled,
    refetchInterval: 15000,
  });
  const refresh = async () => {
    await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  };
  const close = () => {
    setDialog(null);
    setEditCompany(null);
    setEditVacancy(null);
    void refresh();
  };
  const act = async (fn: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await fn();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error : new Error(t('Action failed.')));
    }
  };
  const begin = async (vacancy: Vacancy) => {
    const repeat = (vacancy._count?.applications ?? 0) > 0;
    if (
      repeat &&
      !confirm(t('This vacancy already has an application. Create a separate application?'))
    )
      return;
    const app = await api<Application>('applications', {
      vacancyId: vacancy.id,
      allowRepeat: repeat,
    });
    await refresh();
    navigate('applications', app.id);
  };
  if (!enabled)
    return (
      <div className="login-shell">
        <div className="login-card">
          <LanguagePicker />
          <div className="brand-mark">
            <BriefcaseBusiness size={24} />
          </div>
          <p className="eyebrow">{t('YOUR NEXT CHAPTER')}</p>
          <h1>Job Search OS</h1>
          <p className="muted">{t('Your private workspace for a more intentional job search.')}</p>
          {auth.isPending ? (
            <p>{t('Connecting to your workspace…')}</p>
          ) : (
            <Form
              submit={t('Open workspace')}
              onSubmit={(data) => api('auth/login', { password: data.get('password') })}
              onDone={() => void client.invalidateQueries({ queryKey: ['auth'] })}
            >
              <Field label={t('Owner password')}>
                <input type="password" name="password" autoComplete="current-password" required />
              </Field>
            </Form>
          )}
          <ErrorNotice error={auth.error} />
          <small>{t('Local access · Password is stored in your private .env')}</small>
        </div>
      </div>
    );
  const totals = overview.data?.groups ?? [];
  const count = (s: string) => totals.find((g) => g.status === s)?._count._all ?? 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="?view=overview"
          onClick={(event) => {
            event.preventDefault();
            navigate('overview');
          }}
        >
          <span className="brand-mark">
            <BriefcaseBusiness size={21} />
          </span>
          <div>
            Job Search <strong>OS</strong>
            <small>{t('YOUR NEXT CHAPTER')}</small>
          </div>
        </a>
        <div className="nav-label">{t('WORKSPACE')}</div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              aria-label={t(item.label)}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {t(item.label)}
              {item.id === 'applications' && (
                <span className="nav-count" aria-hidden="true">
                  {applications.data?.total ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-card">
            <span className="green-dot" />
            {t('Private workspace')}
            <small>{t('Your data. Your search.')}</small>
          </div>
          <button
            className="nav-item"
            onClick={() =>
              void act(async () => {
                await api('auth/logout', {});
                client.setQueryData(['auth'], { authenticated: false });
                client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
              })
            }
          >
            <LogOut size={17} />
            {t('Sign out')}
          </button>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            {t('Workspace')}
            <ChevronRight size={13} />{' '}
            {t(navigation.find((n) => n.id === view)?.label ?? 'Overview')}
          </span>
          <LanguagePicker />
          <span className="owner-avatar" title={t('Local owner')}>
            YO
          </span>
        </div>
        <div className="content">
          <header className="page-header">
            <div>
              <p className="eyebrow">{t('JOB SEARCH OS / PERSONAL WORKSPACE')}</p>
              <h1>{t(navigation.find((n) => n.id === view)?.label ?? 'Overview')}</h1>
              <p>{t(subtitles[view])}</p>
            </div>
            {['overview', 'vacancies'].includes(view) && (
              <button
                className="button primary"
                onClick={() => {
                  setEditVacancy(null);
                  setDialog('vacancy');
                }}
              >
                <Plus size={17} />
                {t('Save vacancy')}
              </button>
            )}
            {view === 'companies' && (
              <button className="button primary" onClick={() => setDialog('company')}>
                <Plus size={17} />
                {t('Add company')}
              </button>
            )}
          </header>
          <ErrorNotice error={notice} />
          {view === 'overview' && (
            <>
              <ErrorNotice error={overview.error} />
              <div className="stats-grid">
                {[
                  {
                    name: t('Saved vacancies'),
                    value: overview.data?.vacancies ?? 0,
                    note: t('Opportunities in your pipeline'),
                  },
                  {
                    name: t('Applications sent'),
                    value: overview.data?.submitted ?? 0,
                    note: t('All recorded submissions'),
                  },
                  {
                    name: t('In progress'),
                    value: count('in_progress'),
                    note: t('Conversations moving forward'),
                  },
                  {
                    name: t('Offers'),
                    value: count('offer_received') + count('accepted'),
                    note: t('Your next chapter is getting closer'),
                  },
                ].map((stat, index) => (
                  <div className={`stat-card stat-${index}`} key={stat.name}>
                    <span>{stat.name}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.note}</small>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-title">
                    <h2>{t('Next up')}</h2>
                    <span className="muted">{t('Your upcoming actions')}</span>
                  </div>
                  {overview.data?.actions.length ? (
                    overview.data.actions.map((action) => (
                      <button
                        className="action-card"
                        key={action.id}
                        onClick={() => navigate('applications', action.application?.id)}
                      >
                        <span className="action-icon">
                          <BriefcaseBusiness size={18} />
                        </span>
                        <span>
                          <strong>{action.title}</strong>
                          <small>
                            {action.application?.vacancy.company.name} ·{' '}
                            {action.application?.vacancy.title}
                          </small>
                        </span>
                        <span className={new Date(action.dueAt) < new Date() ? 'overdue' : 'muted'}>
                          {date(action.dueAt)}
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                  ) : (
                    <Empty title={t('A little clarity goes a long way')}>
                      {t(
                        'Add a next action to an application to keep follow-ups and interviews in view.',
                      )}
                    </Empty>
                  )}
                </section>
                <section className="panel journey-card">
                  <span className="eyebrow">{t('MAKE YOUR NEXT MOVE')}</span>
                  <h2>
                    {t('A thoughtful search,')}
                    <br />
                    {t('one step at a time.')}
                  </h2>
                  <p>{t('Save a role. Prepare an application. Keep the conversation moving.')}</p>
                  <button className="button" onClick={() => navigate('vacancies')}>
                    {t('Explore your vacancies')}
                    <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
              <section className="panel">
                <div className="section-title">
                  <h2>{t('Recent applications')}</h2>
                  <button className="text-button" onClick={() => navigate('applications')}>
                    {t('View all →')}
                  </button>
                </div>
                <ApplicationTable
                  data={applications.data?.items.slice(0, 5) ?? []}
                  open={(id) => navigate('applications', id)}
                />
              </section>
            </>
          )}
          {view === 'applications' &&
            (selected ? (
              <ApplicationDetail
                id={selected}
                onBack={() => navigate('applications')}
                refresh={refresh}
              />
            ) : (
              <>
                <div className="toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label={t('Search applications')}
                      placeholder={t('Search company or role…')}
                      value={q}
                      onChange={(event) => filter(event.target.value, status)}
                    />
                  </label>
                  <select
                    aria-label={t('Filter status')}
                    value={status}
                    onChange={(event) => filter(q, event.target.value)}
                  >
                    <option value="">{t('All statuses')}</option>
                    {statuses.map((s) => (
                      <option value={s} key={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                  <a className="button" href="/api/v1/export/csv">
                    {t('Export CSV ↓')}
                  </a>
                  <a className="button" href="/api/v1/export/json">
                    {t('Export JSON ↓')}
                  </a>
                </div>
                <ErrorNotice error={applications.error} />
                <section className="panel table-panel">
                  {applications.isPending ? (
                    <p>{t('Loading applications…')}</p>
                  ) : (
                    <ApplicationTable
                      data={applications.data?.items ?? []}
                      open={(id) => navigate('applications', id)}
                    />
                  )}
                </section>
                <div className="pagination">
                  <span>
                    {t('{count} applications · Page {page}', {
                      count: applications.data?.total ?? 0,
                      page,
                    })}
                  </span>
                  <button
                    className="button"
                    disabled={page <= 1}
                    onClick={() => filter(q, status, page - 1)}
                  >
                    {t('Previous')}
                  </button>
                  <button
                    className="button"
                    disabled={page * 20 >= (applications.data?.total ?? 0)}
                    onClick={() => filter(q, status, page + 1)}
                  >
                    {t('Next')}
                  </button>
                </div>
              </>
            ))}
          {view === 'companies' && (
            <>
              <ErrorNotice error={companies.error} />
              <div className="cards-grid">
                {companies.data?.map((company) => (
                  <section className="panel" key={company.id}>
                    <div className="company-icon">{company.name.slice(0, 2).toUpperCase()}</div>
                    <h3>{company.name}</h3>
                    <p>
                      {company.website ? (
                        <a href={company.website} target="_blank" rel="noreferrer">
                          {t('Company website ↗')}
                        </a>
                      ) : (
                        t('No website saved')
                      )}
                    </p>
                    {company.archived ? (
                      <Badge value="archived" />
                    ) : (
                      <div className="button-row">
                        <button
                          className="button"
                          onClick={() => {
                            setEditCompany(company);
                            setDialog('company');
                          }}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            confirm(
                              t('Archive this company? Existing history will be preserved.'),
                            ) && void act(() => api(`companies/${company.id}/archive`, {}))
                          }
                        >
                          {t('Archive')}
                        </button>
                      </div>
                    )}
                  </section>
                ))}
              </div>
              {!companies.isPending && !companies.data?.length && (
                <Empty title={t('Start with a company')}>
                  {t('Add the teams you would like to work with.')}
                </Empty>
              )}
            </>
          )}
          {view === 'vacancies' && (
            <>
              <ErrorNotice error={vacancies.error} />
              <div className="vacancy-list">
                {vacancies.data?.map((vacancy) => (
                  <section className="panel vacancy-card" key={vacancy.id}>
                    <div className="vacancy-heading">
                      <div className="company-icon">
                        {vacancy.company.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="eyebrow">{vacancy.company.name}</p>
                        <h3>{vacancy.title}</h3>
                        <p className="muted">
                          {known(vacancy.location)} · {label(vacancy.workMode)} ·{' '}
                          {known(vacancy.source)}
                        </p>
                      </div>
                      <Badge value={vacancy.disposition} />
                    </div>
                    <p className="vacancy-excerpt">{vacancy.description}</p>
                    <div className="vacancy-footer">
                      <span>
                        {t('Eligibility:')}
                        <strong>{label(vacancy.eligibility)}</strong>
                      </span>
                      <div className="button-row">
                        <select
                          aria-label={t('Disposition for {title}', { title: vacancy.title })}
                          value={vacancy.disposition}
                          onChange={(event) =>
                            void act(() =>
                              api(`vacancies/${vacancy.id}/disposition`, {
                                disposition: event.target.value,
                              }),
                            )
                          }
                        >
                          {['inbox', 'shortlisted', 'dismissed', 'archived'].map((s) => (
                            <option value={s} key={s}>
                              {label(s)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button"
                          onClick={() => {
                            setEditVacancy(vacancy);
                            setDialog('vacancy');
                          }}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          className="button primary"
                          onClick={() => void act(() => begin(vacancy))}
                        >
                          {t('Prepare application')}
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
              {!vacancies.isPending && !vacancies.data?.length && (
                <Empty title={t('Your next opportunity starts here')}>
                  {t(
                    'Save a vacancy with its description. You can prepare an application when you are ready.',
                  )}
                </Empty>
              )}
            </>
          )}
          {view === 'resumes' && (
            <>
              <section className="panel">
                <h2>{t('Your resume library')}</h2>
                <p className="muted">
                  {t(
                    'Upload an existing PDF. Each file is immutable and can be pinned to an application.',
                  )}
                </p>
                <Form
                  submit={t('Upload PDF')}
                  onSubmit={(data) => api('resumes', data)}
                  onDone={() => void refresh()}
                >
                  <Field label={t('Resume PDF (up to 5 MB)')}>
                    <input type="file" name="file" accept="application/pdf" required />
                  </Field>
                </Form>
              </section>
              <ErrorNotice error={resumes.error} />
              <div className="cards-grid">
                {resumes.data?.map((resume) => (
                  <section className="panel" key={resume.id}>
                    <FileText size={25} className="accent" />
                    <h3>{resume.name}</h3>
                    <p className="muted">
                      {t('{size} KB · Original document', { size: Math.ceil(resume.size / 1024) })}
                    </p>
                    <a href={`/api/v1/resumes/${resume.id}/download`} className="button">
                      {t('Download PDF ↓')}
                    </a>
                  </section>
                ))}
              </div>
            </>
          )}
          {view === 'sources' && (
            <>
              <div className="info-banner">
                {t(
                  'Sources are links in this phase. Automated imports and saved monitoring searches arrive in Phase 4.',
                )}
              </div>
              <ErrorNotice error={sources.error} />
              <div className="cards-grid">
                {sources.data?.map((source) => (
                  <section className="panel" key={source.name}>
                    <Radio size={22} className="accent" />
                    <h3>{source.name}</h3>
                    <p>{t(source.category)}</p>
                    <small className="muted">{t(source.connection)}</small>
                    <a
                      className="button source-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('Open job board')}
                      <ArrowUpRight size={16} />
                    </a>
                  </section>
                ))}
              </div>
            </>
          )}
          {view === 'system' && (
            <>
              <ErrorNotice error={health.error} />
              <div className="section-title">
                <p className="muted">
                  {t('Checked {date} · Refreshes every 15 seconds', {
                    date: date(health.data?.observedAt),
                  })}
                </p>
                <button className="button" onClick={() => void health.refetch()}>
                  {t('Check now')}
                </button>
              </div>
              <div className="cards-grid">
                {[
                  {
                    name: 'API',
                    value: health.isError ? 'unavailable' : (health.data?.api ?? 'checking'),
                    detail: t('Started {date}', { date: date(health.data?.startedAt) }),
                  },
                  {
                    name: 'PostgreSQL',
                    value: health.isError ? 'unknown' : (health.data?.database ?? 'checking'),
                    detail: t('Persistent Docker database · 45432'),
                  },
                  {
                    name: t('Background worker'),
                    value: 'not configured',
                    detail: t('Execution history and recovery arrive in Phase 3.'),
                  },
                ].map((service) => (
                  <section className="panel" key={service.name}>
                    <Activity size={23} className="accent" />
                    <h3>{service.name}</h3>
                    <Badge value={service.value} />
                    <p className="muted">{service.detail}</p>
                  </section>
                ))}
              </div>
              <section className="panel">
                <h3>{t('Infrastructure diagnostics')}</h3>
                <p>{t('Database health, exit reason, start time and Docker restart count:')}</p>
                <code>./scripts/db.ps1 status</code>
                <p>{t('Timestamped PostgreSQL logs:')}</p>
                <code>./scripts/db.ps1 logs</code>
                <p className="muted">
                  {t(
                    'This phase has synchronous requests. Errors include a request ID; durable attempt history is added with background jobs.',
                  )}
                </p>
              </section>
            </>
          )}
        </div>
        <footer>
          {t('Built for a more intentional search.')}
          <span>{t('Private workspace · Phase 1')}</span>
        </footer>
      </main>
      {dialog === 'company' && (
        <Dialog title={editCompany ? t('Edit company') : t('Add company')} onClose={close}>
          <Form
            onSubmit={(data) =>
              api(
                editCompany ? `companies/${editCompany.id}` : 'companies',
                { name: data.get('name'), website: data.get('website') },
                editCompany ? 'PATCH' : 'POST',
              )
            }
            onDone={close}
          >
            <Field label={t('Company name')}>
              <input name="name" required defaultValue={editCompany?.name} maxLength={200} />
            </Field>
            <Field label={t('Website (optional, HTTPS)')}>
              <input
                name="website"
                type="url"
                placeholder="https://example.com"
                defaultValue={editCompany?.website}
              />
            </Field>
          </Form>
        </Dialog>
      )}
      {dialog === 'vacancy' && (
        <Dialog title={editVacancy ? t('Edit vacancy') : t('Save vacancy')} onClose={close}>
          {!companies.data?.some((c) => !c.archived) ? (
            <>
              <p>{t('Add a company before saving a vacancy.')}</p>
              <button className="button primary" onClick={() => setDialog('company')}>
                {t('Add company')}
              </button>
            </>
          ) : (
            <Form
              onSubmit={(data) =>
                api(
                  editVacancy ? `vacancies/${editVacancy.id}` : 'vacancies',
                  Object.fromEntries(data),
                  editVacancy ? 'PATCH' : 'POST',
                )
              }
              onDone={close}
            >
              <Field label={t('Company')}>
                <select name="companyId" defaultValue={editVacancy?.companyId}>
                  {companies.data
                    ?.filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t('Role title')}>
                <input name="title" required defaultValue={editVacancy?.title} maxLength={200} />
              </Field>
              <div className="form-row">
                <Field label={t('Source')}>
                  <input name="source" defaultValue={editVacancy?.source ?? 'Manual'} required />
                </Field>
                <Field label={t('Location / region')}>
                  <input name="location" defaultValue={editVacancy?.location ?? 'Unknown'} />
                </Field>
              </div>
              <Field label={t('Original URL (optional)')}>
                <input name="url" type="url" defaultValue={editVacancy?.url} />
              </Field>
              <div className="form-row">
                <Field label={t('Work mode')}>
                  <select name="workMode" defaultValue={editVacancy?.workMode ?? 'remote'}>
                    {['remote', 'hybrid', 'office'].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('Eligibility')}>
                  <select name="eligibility" defaultValue={editVacancy?.eligibility ?? 'unknown'}>
                    {['unknown', 'eligible', 'ineligible'].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t('Full job description')}>
                <textarea
                  name="description"
                  required
                  rows={6}
                  defaultValue={editVacancy?.description}
                  maxLength={60000}
                />
              </Field>
            </Form>
          )}
        </Dialog>
      )}
    </div>
  );
}
function ApplicationTable({ data, open }: { data: Application[]; open: (id: string) => void }) {
  const { t, date, known } = useLocale();
  if (!data.length)
    return (
      <Empty title={t('Room for your next opportunity')}>
        {t('Prepare an application from a saved vacancy. Matching applications will appear here.')}
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t('Company & role')}</th>
            <th>{t('Status')}</th>
            <th>{t('Source')}</th>
            <th>{t('Submitted')}</th>
            <th>{t('Next action')}</th>
            <th>
              <span className="sr-only">{t('Open')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td>
                <button className="table-link" onClick={() => open(a.id)}>
                  <strong>{a.vacancy.company.name}</strong>
                  <span>{a.vacancy.title}</span>
                </button>
              </td>
              <td>
                <Badge value={a.status} />
              </td>
              <td>{known(a.vacancy.source)}</td>
              <td>{date(a.submittedAt)}</td>
              <td>
                {a.actions?.[0] ? (
                  <span className="next-action">
                    <strong>{a.actions[0].title}</strong>
                    <small>{date(a.actions[0].dueAt)}</small>
                  </span>
                ) : (
                  <span className="muted">{t('No action set')}</span>
                )}
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={t('Open {title}', { title: a.vacancy.title })}
                  onClick={() => open(a.id)}
                >
                  <ChevronRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
