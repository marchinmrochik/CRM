'use client';
import { DraftOperations, type Run } from './operations-workspace';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowUp, ArrowDown, Trash2, FileCheck2 } from 'lucide-react';
import { api, type Vacancy } from '../lib/api';
import {
  type Profile,
  type ProfileContent,
  type Fact,
  type Draft,
  type DraftSummary,
  type Version,
  type Block,
  type Requirement,
  emptyProfile,
  factKinds,
  requirementKinds,
  evidenceStates,
} from '../lib/resume';
import { useLocale } from './locale';
import { Dialog, Empty, ErrorNotice, Field, Form } from './ui';

function useDraftProtection(dirty: boolean) {
  const { t } = useLocale();
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const navigation = target.closest('.nav-item,.brand,.resume-navigation');
      if (navigation && !confirm(t('Discard unsaved changes?'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, t]);
}
export function ProfileWorkspace() {
  const { t } = useLocale();
  const query = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile | null>('profile') });
  return (
    <>
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <p>{t('Loading profile…')}</p>
      ) : (
        !query.isError && (
          <ProfileEditor key={query.data?.revision ?? 0} profile={query.data ?? null} />
        )
      )}
    </>
  );
}
function ProfileEditor({ profile }: { profile: Profile | null }) {
  const { t, label } = useLocale();
  const client = useQueryClient();
  const [content, setContent] = useState<ProfileContent>(profile?.content ?? emptyProfile);
  const dirty = JSON.stringify(content) !== JSON.stringify(profile?.content ?? emptyProfile);
  useDraftProtection(dirty);
  function set<K extends keyof ProfileContent>(key: K, value: ProfileContent[K]) {
    setContent((old) => ({ ...old, [key]: value }));
  }
  function fact(id: string, patch: Partial<Fact>) {
    setContent((old) => ({
      ...old,
      facts: old.facts.map((f) =>
        f.id === id
          ? {
              ...f,
              ...patch,
              ...(Object.keys(patch).some((k) => k !== 'approved') ? { approved: false } : {}),
            }
          : f,
      ),
    }));
  }
  return (
    <Form
      submit={t('Save profile')}
      onSubmit={() => api('profile', { revision: profile?.revision ?? 0, content }, 'PUT')}
      onDone={() => void client.invalidateQueries({ queryKey: ['profile'] })}
    >
      <section className="panel">
        <div className="section-title">
          <h2>{t('Candidate profile')}</h2>
          <span className="muted">
            {t('Revision {number}', { number: profile?.revision ?? 0 })}
          </span>
        </div>
        <p className="muted">
          {t('Only facts you approve can enter a resume. Editing a fact clears its approval.')}
        </p>
        <div className="form-row">
          <Field label={t('Full name')}>
            <input
              required
              maxLength={160}
              value={content.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label={t('Professional headline')}>
            <input
              maxLength={160}
              value={content.headline}
              onChange={(e) => set('headline', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('Email')}>
            <input
              type="email"
              value={content.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label={t('Phone')}>
            <input
              maxLength={80}
              value={content.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label={t('Location / region')}>
            <input
              maxLength={200}
              value={content.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </Field>
          <Field label={t('Website (optional, HTTPS)')}>
            <input
              type="url"
              value={content.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <h2>{t('Profile facts')}</h2>
          <button
            className="button"
            type="button"
            disabled={content.facts.length >= 60}
            onClick={() =>
              set('facts', [
                ...content.facts,
                {
                  id: crypto.randomUUID(),
                  kind: 'experience',
                  title: '',
                  context: '',
                  text: '',
                  approved: false,
                },
              ])
            }
          >
            <Plus size={16} />
            {t('Add fact')}
          </button>
        </div>
        {!content.facts.length && (
          <p className="muted">
            {t(
              'Add your real experience, skills, achievements and education. Nothing is filled in automatically.',
            )}
          </p>
        )}
        {content.facts.map((f, index) => (
          <article className="editor-block" key={f.id}>
            <div className="section-title">
              <strong>{t('Fact {number}', { number: index + 1 })}</strong>
              <button
                className="icon-button"
                type="button"
                aria-label={t('Remove fact {number}', { number: index + 1 })}
                onClick={() =>
                  set(
                    'facts',
                    content.facts.filter((x) => x.id !== f.id),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="form-row">
              <Field label={t('Fact category')}>
                <select
                  value={f.kind}
                  onChange={(e) => fact(f.id, { kind: e.target.value as Fact['kind'] })}
                >
                  {factKinds.map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Fact title')}>
                <input
                  required
                  maxLength={160}
                  value={f.title}
                  onChange={(e) => fact(f.id, { title: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t('Company, role and dates / context')}>
              <input
                maxLength={300}
                value={f.context}
                onChange={(e) => fact(f.id, { context: e.target.value })}
              />
            </Field>
            <Field label={t('Confirmed experience or achievement')}>
              <textarea
                required
                rows={3}
                maxLength={2000}
                value={f.text}
                onChange={(e) => fact(f.id, { text: e.target.value })}
              />
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={f.approved}
                onChange={(e) => fact(f.id, { approved: e.target.checked })}
              />
              {t('I confirm this fact is accurate')}
            </label>
          </article>
        ))}
      </section>
      <p className="muted">
        {t('Profile changes affect new drafts only. Published versions stay unchanged.')}
      </p>
    </Form>
  );
}
export function ResumeStudio({
  vacancies,
  onProfile,
  children,
}: {
  vacancies: Vacancy[];
  onProfile: () => void;
  children: React.ReactNode;
}) {
  const { t, date } = useLocale();
  const client = useQueryClient();
  const [selection, setSelection] = useState<{ draft?: string; version?: string }>(() => {
    const p = new URLSearchParams(typeof window === 'undefined' ? '' : location.search);
    return { draft: p.get('draft') ?? undefined, version: p.get('version') ?? undefined };
  });
  const [create, setCreate] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(location.search).get('create') === 'true',
  );
  const list = useQuery({
    queryKey: ['resume-drafts'],
    queryFn: () => api<DraftSummary[]>('resume-drafts'),
  });
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(location.search);
      setSelection({ draft: p.get('draft') ?? undefined, version: p.get('version') ?? undefined });
    };
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  const open = (value: typeof selection) => {
    setSelection(value);
    const p = new URLSearchParams({ view: 'resumes' });
    const application = new URLSearchParams(location.search).get('application');
    if (application) p.set('application', application);
    if (value.draft) p.set('draft', value.draft);
    if (value.version) p.set('version', value.version);
    history.pushState({}, '', `?${p}`);
  };
  if (selection.draft)
    return (
      <DraftWorkspace
        id={selection.draft}
        onBack={() => open({})}
        onVersion={(id) => open({ version: id })}
      />
    );
  if (selection.version)
    return (
      <VersionWorkspace
        id={selection.version}
        onBack={() => open({})}
        onDraft={(id) => open({ draft: id })}
      />
    );
  return (
    <>
      {' '}
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>{t('Resume studio')}</h2>
            <p className="muted">
              {t('Approved facts → vacancy requirements → review → published PDF')}
            </p>
          </div>
          <div className="button-row">
            <button className="button resume-navigation" onClick={onProfile}>
              {t('Edit profile')}
            </button>
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              {t('Create tailored resume')}
            </button>
          </div>
        </div>
        <ErrorNotice error={list.error} />
        {list.isPending ? (
          <p>{t('Loading resumes…')}</p>
        ) : list.data?.length ? (
          <div className="cards-grid">
            {list.data.map((d) => (
              <article className="editor-block" key={d.id}>
                <FileCheck2 size={24} className="accent" />
                <h3>{d.name}</h3>
                <small className="muted">{date(d.updatedAt)}</small>
                <p>{t('Published versions: {count}', { count: d.versions.length })}</p>
                <button className="button" onClick={() => open({ draft: d.id })}>
                  {t('Edit draft')}
                </button>
                {d.versions[0] && (
                  <button
                    className="text-button"
                    onClick={() => open({ version: d.versions[0].id })}
                  >
                    {t('View published version')}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty title={t('Your experience, tailored honestly')}>
            {t('Start with approved profile facts, then create a resume for a saved vacancy.')}
          </Empty>
        )}
        {create && (
          <Dialog title={t('Create tailored resume')} onClose={() => setCreate(false)}>
            <Form
              submit={t('Create draft')}
              onSubmit={async (data) => {
                const d = await api<Draft>('resume-drafts', {
                  name: data.get('name'),
                  vacancyId: data.get('vacancyId'),
                });
                setCreate(false);
                await client.invalidateQueries({ queryKey: ['resume-drafts'] });
                open({ draft: d.id });
              }}
            >
              <Field label={t('Resume name')}>
                <input required name="name" maxLength={160} />
              </Field>
              <Field label={t('Target vacancy')}>
                <select
                  name="vacancyId"
                  required
                  defaultValue={
                    typeof window === 'undefined'
                      ? ''
                      : (new URLSearchParams(location.search).get('vacancy') ?? '')
                  }
                >
                  <option value="">{t('Select a vacancy')}</option>
                  {vacancies.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.company.name} · {v.title}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="muted">
                {t('The current profile and vacancy description are captured in this draft.')}
              </p>
            </Form>
          </Dialog>
        )}
      </section>
      {children}
    </>
  );
}
function DraftWorkspace({
  id,
  onBack,
  onVersion,
}: {
  id: string;
  onBack: () => void;
  onVersion: (id: string) => void;
}) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ['resume-draft', id],
    queryFn: () => api<Draft>(`resume-drafts/${id}`),
  });
  return (
    <>
      <button className="text-button resume-navigation" onClick={onBack}>
        {t('← Resume library')}
      </button>
      <ErrorNotice error={query.error} />
      {query.data ? (
        <DraftEditor key={query.data.revision} draft={query.data} onVersion={onVersion} />
      ) : (
        query.isPending && <p>{t('Loading resume draft…')}</p>
      )}
    </>
  );
}
function DraftEditor({ draft, onVersion }: { draft: Draft; onVersion: (id: string) => void }) {
  const { t, label, date } = useLocale();
  const client = useQueryClient();
  const [name, setName] = useState(draft.name);
  const [content, setContent] = useState(draft.content);
  const [requirements, setRequirements] = useState(draft.requirements);
  const [review, setReview] = useState(false);
  const [publishId, setPublishId] = useState<string | null>(null);
  const dirty =
    name !== draft.name ||
    JSON.stringify(content) !== JSON.stringify(draft.content) ||
    JSON.stringify(requirements) !== JSON.stringify(draft.requirements);
  useDraftProtection(dirty);
  const facts = draft.profileSnapshot.facts.filter((f) => f.approved);
  const block = (id: string, patch: Partial<Block>) =>
    setContent((old) => ({
      ...old,
      blocks: old.blocks.map((b) => (b.factId === id ? { ...b, ...patch } : b)),
    }));
  function move(index: number, delta: number) {
    setContent((old) => {
      const blocks = [...old.blocks];
      [blocks[index], blocks[index + delta]] = [blocks[index + delta], blocks[index]];
      return { ...old, blocks };
    });
  }
  const requirement = (id: string, patch: Partial<Requirement>) =>
    setRequirements((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <>
      <div className="section-title editor-title">
        <div>
          <h2>{draft.name}</h2>
          <p className="muted">
            {draft.vacancySnapshot.company} · {draft.vacancySnapshot.title}
          </p>
        </div>
        <span className="badge">{t('Revision {number}', { number: draft.revision })}</span>
      </div>
      <div className="info-banner">
        {t(
          'Reword confirmed experience; never add experience you do not have. Publication requires your approval.',
        )}
      </div>
      <Form
        submit={t('Save draft')}
        disabled={!!publishId}
        onSubmit={() =>
          api<Draft>(
            `resume-drafts/${draft.id}`,
            { revision: draft.revision, name, content, requirements },
            'PATCH',
          )
        }
        onDone={() => {
          void client.invalidateQueries({ queryKey: ['resume-draft', draft.id] });
          void client.invalidateQueries({ queryKey: ['resume-drafts'] });
        }}
      >
        <div className="resume-editor-grid">
          <div className="stack">
            <section className="panel">
              <h3>{t('Resume content')}</h3>
              <Field label={t('Resume name')}>
                <input
                  required
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t('Professional headline')}>
                <input
                  maxLength={160}
                  value={content.headline}
                  onChange={(e) => setContent((old) => ({ ...old, headline: e.target.value }))}
                />
              </Field>
              {content.blocks.map((b, index) => {
                const source = facts.find((f) => f.id === b.factId)!;
                return (
                  <article className="editor-block" key={b.factId}>
                    <div className="section-title">
                      <strong>{label(b.kind)}</strong>
                      <div className="button-row">
                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === 0}
                          aria-label={t('Move block up {number}', { number: index + 1 })}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={index === content.blocks.length - 1}
                          aria-label={t('Move block down {number}', { number: index + 1 })}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t('Remove block {number}', { number: index + 1 })}
                          onClick={() =>
                            setContent((old) => ({
                              ...old,
                              blocks: old.blocks.filter((x) => x.factId !== b.factId),
                            }))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <Field label={t('Section title')}>
                      <input
                        required
                        maxLength={160}
                        value={b.title}
                        onChange={(e) => block(b.factId, { title: e.target.value })}
                      />
                    </Field>
                    <Field label={t('Company, role and dates / context')}>
                      <input
                        maxLength={300}
                        value={b.context}
                        onChange={(e) => block(b.factId, { context: e.target.value })}
                      />
                    </Field>
                    <Field label={t('Resume wording')}>
                      <textarea
                        required
                        rows={4}
                        maxLength={2000}
                        value={b.text}
                        onChange={(e) => block(b.factId, { text: e.target.value })}
                      />
                    </Field>
                    <details className="evidence-source">
                      <summary>{t('Approved source fact')}</summary>
                      <p>{source.title}</p>
                      <p className="description">{source.text}</p>
                    </details>
                  </article>
                );
              })}
              <Field label={t('Add approved fact')}>
                <select
                  value=""
                  onChange={(e) => {
                    const f = facts.find((f) => f.id === e.target.value);
                    if (f)
                      setContent((old) => ({
                        ...old,
                        blocks: [
                          ...old.blocks,
                          {
                            factId: f.id,
                            kind: f.kind,
                            title: f.title,
                            context: f.context,
                            text: f.text,
                          },
                        ],
                      }));
                  }}
                >
                  <option value="">{t('Select a fact')}</option>
                  {facts
                    .filter((f) => !content.blocks.some((b) => b.factId === f.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                </select>
              </Field>
            </section>
          </div>
          <div className="stack">
            <section className="panel">
              <h3>{t('Captured vacancy')}</h3>
              <p className="description vacancy-capture">{draft.vacancySnapshot.description}</p>
            </section>
            <section className="panel">
              <div className="section-title">
                <h3>{t('Requirements and evidence')}</h3>
                <button
                  className="button"
                  type="button"
                  disabled={requirements.length >= 40}
                  onClick={() =>
                    setRequirements((old) => [
                      ...old,
                      {
                        id: crypto.randomUUID(),
                        quote: '',
                        kind: 'mandatory',
                        state: 'needs_confirmation',
                        factIds: [],
                      },
                    ])
                  }
                >
                  {t('Add requirement')}
                </button>
              </div>
              <p className="muted">
                {t('Quote the original description. Map evidence or leave a visible gap.')}
              </p>
              {requirements.map((r, index) => (
                <article className="editor-block" key={r.id}>
                  <div className="section-title">
                    <strong>{t('Requirement {number}', { number: index + 1 })}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('Remove requirement {number}', { number: index + 1 })}
                      onClick={() => setRequirements((old) => old.filter((x) => x.id !== r.id))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <Field label={t('Exact vacancy quote')}>
                    <textarea
                      required
                      rows={2}
                      maxLength={1500}
                      value={r.quote}
                      onChange={(e) => requirement(r.id, { quote: e.target.value })}
                    />
                  </Field>
                  <Field label={t('Requirement category')}>
                    <select
                      value={r.kind}
                      onChange={(e) =>
                        requirement(r.id, { kind: e.target.value as Requirement['kind'] })
                      }
                    >
                      {requirementKinds.map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('Evidence status')}>
                    <select
                      value={r.state}
                      onChange={(e) =>
                        requirement(r.id, {
                          state: e.target.value as Requirement['state'],
                          ...(e.target.value === 'unsupported' ? { factIds: [] } : {}),
                        })
                      }
                    >
                      {evidenceStates.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="muted">{t('Evidence facts')}</p>
                  {facts.map((f) => (
                    <label className="check" key={f.id}>
                      <input
                        type="checkbox"
                        disabled={r.state === 'unsupported'}
                        checked={r.factIds.includes(f.id)}
                        onChange={(e) =>
                          requirement(r.id, {
                            factIds: e.target.checked
                              ? [...r.factIds, f.id]
                              : r.factIds.filter((id) => id !== f.id),
                          })
                        }
                      />
                      {f.title}
                    </label>
                  ))}
                </article>
              ))}
              {!requirements.length && (
                <p className="muted">
                  {t(
                    'No requirements mapped yet. You can publish a general resume or add requirements for this vacancy.',
                  )}
                </p>
              )}
            </section>
          </div>
        </div>
      </Form>
      <div className="review-bar">
        <span className="muted">
          {dirty
            ? t('Save your changes before review.')
            : t('All changes saved. Ready for manual review.')}
        </span>
        <button
          className="button primary"
          disabled={dirty || !!publishId}
          onClick={() => setReview(true)}
        >
          {t('Review and publish')}
        </button>
      </div>
      <DraftOperations
        draft={draft}
        disabled={dirty || !!publishId}
        onVersion={onVersion}
        publishId={publishId}
        onFailure={() => setPublishId(null)}
      />
      {draft.versions.length > 0 && (
        <section className="panel">
          <h3>{t('Published versions')}</h3>
          {draft.versions.map((v) => (
            <div className="item-row" key={v.id}>
              <span>
                {t('Version {number}', { number: v.number })} · {date(v.createdAt)}
              </span>
              <button className="text-button resume-navigation" onClick={() => onVersion(v.id)}>
                {t('View version')}
              </button>
            </div>
          ))}
        </section>
      )}
      {review && (
        <Dialog title={t('Review before publication')} onClose={() => setReview(false)}>
          <div className="review-summary">
            <p>{t('Changes are compared with the base draft or the last published version.')}</p>
            <ChangeList changes={draft.diff} />
            <h3>{t('Requirement coverage')}</h3>
            {requirements.length ? (
              requirements.map((r) => (
                <div className="requirement-review" key={r.id}>
                  <p>{r.quote}</p>
                  <span className={`evidence-status evidence-${r.state}`}>{label(r.state)}</span>
                  <small>
                    {r.factIds.map((id) => facts.find((f) => f.id === id)?.title).join(' · ') ||
                      t('No supporting evidence')}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">
                {t(
                  'No requirements mapped yet. You can publish a general resume or add requirements for this vacancy.',
                )}
              </p>
            )}
            <h3>{t('Document preview')}</h3>
            <p className="muted">
              {t('Preview shows content; download the PDF to check exact pagination.')}
            </p>
            <ResumePreview profile={draft.profileSnapshot} content={draft.content} />
          </div>
          <Form
            submit={t('Publish version and PDF')}
            onSubmit={async (data) => {
              if (data.get('approved') !== 'on')
                throw new Error(t('Confirm the accuracy of the resume before publishing.'));
              const operation = await api<Run>(`resume-drafts/${draft.id}/publish`, {
                revision: draft.revision,
                approved: true,
              });
              setReview(false);
              setPublishId(operation.id);
              await client.invalidateQueries({ queryKey: ['operations'] });
            }}
          >
            <label className="check">
              <input required type="checkbox" name="approved" />
              {t(
                'I reviewed every change and confirm the resume accurately reflects my experience.',
              )}
            </label>
            <p className="muted">
              {t(
                'This creates an immutable version and PDF. Existing applications are not changed.',
              )}
            </p>
          </Form>
        </Dialog>
      )}
    </>
  );
}
function ChangeList({ changes }: { changes: Draft['diff'] }) {
  const { t } = useLocale();
  return changes.length ? (
    <div className="change-list">
      {changes.map((c, index) => (
        <article key={index}>
          <strong>{t('Change {number}', { number: index + 1 })}</strong>
          <div className="diff-grid">
            <div className="diff-before">
              <small>{t('Before')}</small>
              <p>{c.before || t('Not included')}</p>
            </div>
            <div className="diff-after">
              <small>{t('After')}</small>
              <p>{c.after || t('Not included')}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <p className="muted">{t('No wording changes from the baseline.')}</p>
  );
}
function ResumePreview({
  profile,
  content,
}: {
  profile: ProfileContent;
  content: Draft['content'];
}) {
  const headings = {
    summary: 'Summary',
    skill: 'Skills',
    experience: 'Experience',
    achievement: 'Achievements',
    education: 'Education',
  };
  return (
    <article className="resume-paper">
      <h2>{profile.name}</h2>
      <p className="resume-headline">{content.headline}</p>
      <p className="resume-contact">
        {[profile.email, profile.phone, profile.location, profile.website]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {content.blocks.map((b, index) => (
        <section key={b.factId}>
          {(index === 0 || content.blocks[index - 1].kind !== b.kind) && (
            <h3>{headings[b.kind]}</h3>
          )}
          <strong>{b.title}</strong>
          {b.context && <small>{b.context}</small>}
          <p>{b.text}</p>
        </section>
      ))}
    </article>
  );
}
function VersionWorkspace({
  id,
  onBack,
  onDraft,
}: {
  id: string;
  onBack: () => void;
  onDraft: (id: string) => void;
}) {
  const { t, date } = useLocale();
  const query = useQuery({
    queryKey: ['resume-version', id],
    queryFn: () => api<Version>(`resume-versions/${id}`),
  });
  const client = useQueryClient();
  const v = query.data;
  return (
    <>
      <button className="text-button resume-navigation" onClick={onBack}>
        {t('← Resume library')}
      </button>
      <ErrorNotice error={query.error} />
      {v ? (
        <>
          <section className="panel">
            <div className="section-title">
              <div>
                <p className="eyebrow">{t('Immutable published version')}</p>
                <h2>
                  {v.name} · {t('Version {number}', { number: v.number })}
                </h2>
                <p className="muted">
                  {date(v.createdAt)} · {v.vacancySnapshot.company}
                </p>
              </div>
              <a className="button primary" href={`/api/v1/resumes/${v.artifactId}/download`}>
                {t('Download PDF ↓')}
              </a>
            </div>
            <p>{t('Select this PDF when marking an application as submitted.')}</p>
            <Form
              submit={t('Create draft from this version')}
              onSubmit={async () => {
                const d = await api<Draft>(`resume-versions/${id}/fork`, {});
                await client.invalidateQueries({ queryKey: ['resume-drafts'] });
                onDraft(d.id);
              }}
            >
              <p className="muted">
                {t('A new draft keeps the version history and uses currently approved facts.')}
              </p>
            </Form>
            {v.parentVersionId && (
              <p className="muted">
                {t('Parent version')}:{' '}
                <a href={`?view=resumes&version=${v.parentVersionId}`}>{t('View version')}</a>
              </p>
            )}
          </section>
          <div className="resume-version-grid">
            <ResumePreview profile={v.profileSnapshot} content={v.content} />
            <section className="panel">
              <h3>{t('Accepted changes')}</h3>
              <ChangeList changes={v.acceptedDiff} />
              <h3>{t('Requirement coverage')}</h3>
              {v.requirements.map((r) => (
                <div className="requirement-review" key={r.id}>
                  <p>{r.quote}</p>
                  <span className="evidence-status">
                    {t(
                      {
                        supported: 'Supported',
                        partially_supported: 'Partially supported',
                        needs_confirmation: 'Needs confirmation',
                        unsupported: 'Unsupported',
                      }[r.state],
                    )}
                  </span>
                </div>
              ))}
              <p className="muted">{t('Stored PDF checksum')}</p>
              <code className="checksum">{v.artifact.checksum}</code>
            </section>
          </div>
        </>
      ) : (
        query.isPending && <p>{t('Loading resume version…')}</p>
      )}
    </>
  );
}
