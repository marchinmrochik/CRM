import { defineConfig } from '@playwright/test';
if (
  !process.env.CI &&
  (process.env.POSTGRES_DB !== 'jobhunt_e2e' ||
    process.env.POSTGRES_PORT !== '45442' ||
    process.env.E2E_BASE_URL !== 'http://127.0.0.1:43180')
) {
  throw new Error(
    'Browser tests require the isolated E2E stack. Run node scripts/test-e2e.mjs. Personal workspace tests are blocked.',
  );
}
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:43170',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
});
