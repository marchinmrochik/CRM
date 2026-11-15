import { afterEach, beforeEach, it, expect, vi } from 'vitest';
vi.mock('dotenv', () => ({ config: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    APP_ROLE: 'api',
    POSTGRES_DB: 'fixture',
    POSTGRES_USER: 'admin',
    POSTGRES_PASSWORD: 'test-only-database-password',
    POSTGRES_PORT: '45442',
    API_PORT: '43171',
    REDIS_PORT: '46379',
    WORKER_HEALTH_PORT: '43172',
    DATABASE_HOST: '127.0.0.1',
    WEB_ORIGIN: 'http://127.0.0.1:43170',
    COOKIE_SECURE: 'false',
    SESSION_SECRET: 'test-only-session-secret-with-sufficient-length',
    OWNER_PASSWORD: 'test-only-owner-password',
    RUNTIME_DATABASE_USER: '',
    RUNTIME_DATABASE_PASSWORD: '',
    REDIS_PASSWORD: '',
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  'http://evil.example',
  'https://example.com',
  'http://127.0.0.1:43170/path',
  'http://user:pass@localhost:43170',
])('rejects unsafe or mismatched origin %s', async (origin) => {
  vi.stubEnv('WEB_ORIGIN', origin);
  await expect(import('../apps/api/src/config')).rejects.toThrow('WEB_ORIGIN');
});
it('requires secure cookies with HTTPS', async () => {
  vi.stubEnv('WEB_ORIGIN', 'https://example.com');
  vi.stubEnv('COOKIE_SECURE', 'true');
  expect((await import('../apps/api/src/config')).settings.COOKIE_SECURE).toBe('true');
});
it.each(['worker', 'migrate'])(
  'does not require web authentication secrets for %s',
  async (role) => {
    vi.stubEnv('APP_ROLE', role);
    vi.stubEnv('OWNER_PASSWORD', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
    expect((await import('../apps/api/src/config')).settings.APP_ROLE).toBe(role);
  },
);
it('requires API secrets without printing them', async () => {
  vi.stubEnv('OWNER_PASSWORD', undefined);
  await expect(import('../apps/api/src/config')).rejects.toThrow('OWNER_PASSWORD');
});
it('selects runtime credentials for normal execution but retains a separate migration connection', async () => {
  vi.stubEnv('RUNTIME_DATABASE_USER', 'runtime');
  vi.stubEnv('RUNTIME_DATABASE_PASSWORD', 'test-only-runtime-password');
  const config = await import('../apps/api/src/config');
  expect(config.databaseUrl).toContain('runtime:');
  expect(config.migrationDatabaseUrl).toContain('admin:');
});
it('rejects incomplete credential pairs', async () => {
  vi.stubEnv('RUNTIME_DATABASE_USER', 'runtime');
  await expect(import('../apps/api/src/config')).rejects.toThrow('RUNTIME_DATABASE_USER');
});
it.each(['3000', '5000', '8000', '1433', '5432', '6379', '80', '65536'])(
  'blocks reserved/out-of-range port %s',
  async (port) => {
    vi.stubEnv('API_PORT', port);
    await expect(import('../apps/api/src/config')).rejects.toThrow('Invalid or reserved host port');
  },
);
