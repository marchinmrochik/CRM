import { afterEach, describe, it, expect, vi } from 'vitest';
import { api, ApiError, label, date, iso } from '../apps/web/lib/api';
afterEach(() => vi.unstubAllGlobals());
describe('browser API transport', () => {
  it('announces expired protected sessions but avoids login/me loops', async () => {
    const target = new EventTarget(),
      expired = vi.fn();
    target.addEventListener('jobhunt:session-expired', expired);
    vi.stubGlobal('window', target);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('{}', { status: 401 })),
    );
    await expect(api('companies')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    await expect(api('auth/me')).rejects.toBeInstanceOf(ApiError);
    await expect(api('auth/login')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it.each([
    [{ reason: 'Safe reason' }, 'Safe reason'],
    [{}, 'Request failed.'],
  ])('uses safe fallback error messages', async (body, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })),
    );
    await expect(api('today')).rejects.toThrow(String(message));
  });
  it('reads with session credentials and does not send a JSON body', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    expect(await api('today')).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/today',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin', body: undefined }),
    );
  });
  it('serializes mutations with the CSRF client header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await api('companies/id', { name: 'Fixture' }, 'PATCH');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      headers: { 'X-Jobhunt-Client': 'web', 'Content-Type': 'application/json' },
      body: '{"name":"Fixture"}',
    });
  });
  it('lets the browser generate multipart boundaries', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const form = new FormData();
    form.set('file', new Blob(['%PDF-']), 'fixture.pdf');
    await api('resumes', form);
    expect(fetcher.mock.calls[0][1].body).toBe(form);
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
  });
  it.each([401, 403, 409, 429, 503])(
    'preserves HTTP %s errors and correlation details',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              message: 'Safe error',
              requestId: 'test-id',
              fields: [{ field: 'name', message: 'Required' }],
            }),
            { status },
          ),
        ),
      );
      try {
        await api('companies');
        throw new Error('Expected failure');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
          status,
          requestId: 'test-id',
          message: 'Safe error',
          fields: [{ field: 'name', message: 'Required' }],
        });
      }
    },
  );
  it('handles non-JSON failures without leaking raw response text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private server trace', { status: 502 })),
    );
    await expect(api('today')).rejects.toThrow('Cannot reach the API');
  });
  it('propagates offline errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(api('today')).rejects.toThrow('offline');
  });
  it('formats empty dates, labels and submission timestamps', () => {
    expect(date()).toBe('—');
    expect(label('offer_received')).toBe('Offer received');
    expect(iso('2026-11-01T10:00:00Z')).toBe('2026-11-01T10:00:00.000Z');
  });
});
