// @vitest-environment jsdom
import { createElement as h } from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Form, Field, ErrorNotice } from '../apps/web/components/ui';
import { LocaleProvider, LanguagePicker } from '../apps/web/components/locale';
import { TodayWorkspace } from '../apps/web/components/today-workspace';
import { api, ApiError } from '../apps/web/lib/api';
vi.mock('../apps/web/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apps/web/lib/api')>()),
  api: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(api).mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('shared UI behavior', () => {
  it('associates field labels and preserves entered values on a failed submission', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Could not save'));
    render(
      h(Form, {
        onSubmit: submit,
        submit: 'Save',
        children: h(Field, {
          label: 'Company name',
          children: h('input', { name: 'name', defaultValue: 'Candidate value' }),
        }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Could not save'),
    );
    expect((screen.getByLabelText('Company name') as HTMLInputElement).value).toBe(
      'Candidate value',
    );
    expect(submit.mock.calls[0][0].get('name')).toBe('Candidate value');
  });
  it('prevents duplicate submissions while pending and resets only after success', async () => {
    let finish!: () => void;
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const done = vi.fn();
    render(
      h(Form, {
        onSubmit: submit,
        onDone: done,
        submit: 'Save',
        children: h(Field, {
          label: 'Name',
          children: h('input', { name: 'name', defaultValue: '' }),
        }),
      }),
    );
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Entered' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const pending = screen.getByRole('button', { name: 'Saving…' });
    expect((pending.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(pending);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(done).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
  });
  it('shows safe API field and correlation errors as an alert', () => {
    render(
      h(ErrorNotice, {
        error: new ApiError('Check the highlighted fields.', 400, 'correlation-123', [
          { field: 'name', message: 'Required' },
        ]),
      }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Company name');
    expect(screen.getByRole('alert').textContent).toContain('correlation-123');
  });
  it('restores and persists a valid interface language', async () => {
    localStorage.setItem('jobhunt.locale', 'ru');
    render(h(LocaleProvider, { children: h(LanguagePicker) }));
    await waitFor(() => expect(document.documentElement.lang).toBe('ru'));
    fireEvent.change(screen.getByTestId('language-switch'), { target: { value: 'uk' } });
    await waitFor(() => expect(localStorage.getItem('jobhunt.locale')).toBe('uk'));
    expect(document.documentElement.lang).toBe('uk');
  });
});
describe('Today dashboard', () => {
  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const open = vi.fn(),
      search = vi.fn();
    render(h(QueryClientProvider, { client, children: h(TodayWorkspace, { open, search }) }));
    return { open, search, client };
  }
  it('shows pending state and handles empty schedules', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }) as ReturnType<typeof api>,
    );
    const { search } = mount();
    expect(screen.getByRole('status').textContent).toContain('Updating');
    await act(async () => resolve({ actions: [], interviews: [], unseen: 0, drafts: 0 }));
    expect(await screen.findAllByText('Nothing needs attention here')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Find your next role' }));
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('opens the linked application and renders actual counts', async () => {
    vi.mocked(api).mockResolvedValue({
      actions: [
        {
          id: 'task',
          applicationId: 'app',
          title: 'Follow up',
          dueAt: '2020-01-01T00:00:00Z',
          application: { vacancy: { title: 'React Engineer', company: { name: 'Fixture' } } },
        },
      ],
      interviews: [],
      unseen: 7,
      drafts: 2,
    });
    const { open } = mount();
    fireEvent.click(await screen.findByRole('button', { name: /Follow up/ }));
    expect(open).toHaveBeenCalledWith('app');
    expect(screen.getByText(/Unseen jobs: 7/)).toBeTruthy();
    expect(screen.getByText(/Draft applications: 2/)).toBeTruthy();
  });
  it('exposes failed requests instead of silently claiming success', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError('Service unavailable', 503));
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('Service unavailable');
  });
});
