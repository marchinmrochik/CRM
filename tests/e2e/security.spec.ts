import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Database } from '../../apps/api/src/database';
const settings = parse(readFileSync('.env'));

test('private API rejects anonymous access, unsafe origins and invalid uploads', async ({
  request,
}) => {
  const pageResponse = await request.get('/');
  expect(pageResponse.headers()['x-content-type-options']).toBe('nosniff');
  expect(pageResponse.headers()['x-frame-options']).toBe('DENY');
  expect(pageResponse.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(pageResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect((await request.get('/api/v1/companies')).status()).toBe(401);
  expect((await request.get('/api/v1/resumes/nonexistent/download')).status()).toBe(401);
  expect(
    (
      await request.post('/api/v1/auth/login', {
        data: { password: process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD },
      })
    ).status(),
  ).toBe(403);
  const headers = {
    Origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
    'X-Jobhunt-Client': 'web',
  };
  expect(
    (
      await request.post('/api/v1/auth/login', { headers, data: { password: 'wrong-password' } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/v1/auth/login', {
        headers,
        data: { password: process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post('/api/v1/companies', {
        headers: { ...headers, Origin: 'https://untrusted.invalid' },
        data: { name: 'Never created' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/v1/resumes', {
        headers,
        multipart: {
          file: {
            name: 'invalid.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('Not a PDF'),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/v1/resumes', {
        headers,
        multipart: {
          file: {
            name: 'oversized.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
          },
        },
      })
    ).status(),
  ).toBe(413);
  const badQuery = await request.get('/api/v1/applications?page=-1');
  expect(badQuery.status()).toBe(400);
  expect((await badQuery.json()).requestId).toBeTruthy();
  expect(
    (
      await request.post('/api/v1/resumes', {
        headers,
        multipart: {
          file: {
            name: 'fake.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%%EOF'),
          },
        },
      })
    ).status(),
  ).toBe(400);
  const cookie = (await request.storageState()).cookies.find(
    (cookie) => cookie.name === 'jobhunt.sid',
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Strict');
  const signed = decodeURIComponent(cookie.value),
    sid = signed.slice(2, signed.lastIndexOf('.'));
  const db = new Database();
  try {
    const row = await db.session.findUniqueOrThrow({ where: { sid } });
    await db.session.update({
      where: { sid },
      data: {
        sess: {
          ...(row.sess as Record<string, unknown>),
          authenticatedAt: Date.now() - 2 * 86400000,
        },
      },
    });
    expect((await request.get('/api/v1/companies')).status()).toBe(401);
    expect(await (await request.get('/api/v1/auth/me')).json()).toEqual({ authenticated: false });
  } finally {
    await db.$disconnect();
  }
  await request.post('/api/v1/auth/logout', { headers, data: {} });
  expect((await request.get('/api/v1/companies')).status()).toBe(401);
});
