import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const settings = parse(readFileSync('.env'));

test('private API rejects anonymous access, unsafe origins and invalid uploads', async ({
  request,
}) => {
  expect((await request.get('/api/v1/companies')).status()).toBe(401);
  expect((await request.get('/api/v1/resumes/nonexistent/download')).status()).toBe(401);
  expect(
    (
      await request.post('/api/v1/auth/login', { data: { password: settings.OWNER_PASSWORD } })
    ).status(),
  ).toBe(403);
  const headers = { Origin: 'http://127.0.0.1:43170', 'X-Jobhunt-Client': 'web' };
  expect(
    (
      await request.post('/api/v1/auth/login', { headers, data: { password: 'wrong-password' } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/v1/auth/login', {
        headers,
        data: { password: settings.OWNER_PASSWORD },
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
  await request.post('/api/v1/auth/logout', { headers, data: {} });
  expect((await request.get('/api/v1/companies')).status()).toBe(401);
});
