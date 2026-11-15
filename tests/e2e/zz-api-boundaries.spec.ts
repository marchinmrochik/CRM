import { test, expect, type APIRequestContext } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const settings = parse(readFileSync('.env'));
const headers = {
  Origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
  'X-Jobhunt-Client': 'web',
};
test.setTimeout(120000);
async function login(request: APIRequestContext) {
  let response = await request.post('/api/v1/auth/login', {
    headers,
    data: { password: process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD },
  });
  if (response.status() === 429) {
    await delay(
      Math.min(60, Math.max(1, Number(response.headers()['retry-after']) || 60)) * 1000 + 100,
    );
    response = await request.post('/api/v1/auth/login', {
      headers,
      data: { password: process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD },
    });
  }
  expect(response.status()).toBe(200);
}
const protectedReads = [
  'today',
  'companies',
  'vacancies',
  'applications',
  'profile',
  'resumes',
  'discovery/sources',
  'discovery/listings',
  'discovery/searches',
  'analytics',
  'analytics/export',
  'operations',
  'export/json',
  'export/csv',
];
test('every private feature rejects anonymous reads and revokes access on logout', async ({
  request,
}) => {
  for (const path of protectedReads)
    expect((await request.get('/api/v1/' + path)).status(), path).toBe(401);
  await login(request);
  const auth = await request.get('/api/v1/auth/me');
  expect(await auth.json()).toMatchObject({ authenticated: true });
  const ready = await request.get('/api/v1/health/ready');
  const body = JSON.stringify(await ready.json());
  for (const secret of [
    process.env.OWNER_PASSWORD ?? settings.OWNER_PASSWORD,
    process.env.SESSION_SECRET ?? settings.SESSION_SECRET,
    process.env.POSTGRES_PASSWORD ?? settings.POSTGRES_PASSWORD,
  ])
    if (secret) expect(body).not.toContain(secret);
  await request.post('/api/v1/auth/logout', { headers, data: {} });
  for (const path of protectedReads)
    expect((await request.get('/api/v1/' + path)).status(), path).toBe(401);
});
test('invalid filters and mutations fail without writing domain records', async ({ request }) => {
  await login(request);
  const before = await (await request.get('/api/v1/companies')).json();
  for (const query of [
    'page=-1',
    'page=100001',
    'connector=unknown',
    'sort=unknown',
    'postedWithin=365',
    'keywords=' + 'x'.repeat(151),
    'unexpected=true',
  ])
    expect((await request.get('/api/v1/discovery/listings?' + query)).status(), query).toBe(400);
  for (const payload of [
    { name: '' },
    { name: 'x'.repeat(201) },
    { name: 'Unsafe', website: 'javascript:alert(1)' },
  ])
    expect((await request.post('/api/v1/companies', { headers, data: payload })).status()).toBe(
      400,
    );
  expect(await (await request.get('/api/v1/companies')).json()).toEqual(before);
  expect((await request.get('/api/v1/analytics?from=2026-11-03&to=2026-11-01')).status()).toBe(400);
  expect(
    (
      await request.post('/api/v1/discovery/sources/unknown/import', { headers, data: {} })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/v1/companies', {
        headers: { Origin: headers.Origin },
        data: { name: 'Missing client header' },
      })
    ).status(),
  ).toBe(403);
});
test('search URL restores filters and selected state through browser navigation', async ({
  page,
}) => {
  await login(page.request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Job search', exact: true }).click();
  await page.getByLabel('Keywords (all words)').fill('nonexistent-role-fixture');
  await page.getByLabel('Sort results').selectOption('imported');
  await expect(page).toHaveURL(/job_sort=imported/);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.getByRole('button', { name: 'Job search', exact: true }).click();
  await expect(page.getByLabel('Keywords (all words)')).toHaveValue('nonexistent-role-fixture');
  await expect(page.getByLabel('Sort results')).toHaveValue('imported');
  await page.reload();
  await expect(page.getByLabel('Keywords (all words)')).toHaveValue('nonexistent-role-fixture');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByLabel('Keywords (all words)')).toHaveValue('');
});
