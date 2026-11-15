import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '-f', 'compose.e2e.yaml'];
const env = {
  ...process.env,
  POSTGRES_DB: 'jobhunt_e2e',
  POSTGRES_USER: 'jobhunt_test',
  POSTGRES_PASSWORD: 'e2e-only-synthetic-database-password',
  POSTGRES_PORT: '45442',
  APP_ROLE: 'api',
  RUNTIME_DATABASE_USER: '',
  RUNTIME_DATABASE_PASSWORD: '',
  REDIS_PASSWORD: '',
  OWNER_PASSWORD: 'e2e-only-synthetic-owner-password',
  SESSION_SECRET: 'e2e-only-synthetic-session-secret-with-sufficient-length',
  E2E_BASE_URL: 'http://127.0.0.1:43180',
  DATABASE_HOST: '127.0.0.1',
};
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
try {
  const started = await run('docker', [
    ...compose,
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '180',
  ]);
  if (started) throw new Error('Isolated E2E stack could not start. Build the owner images first.');
  const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
  process.exitCode = await run(process.execPath, [cli, 'test', ...process.argv.slice(2)]);
} finally {
  // Only this disposable test project and its synthetic PDF volume are removed.
  const stopped = await run('docker', [...compose, 'down', '--volumes']);
  if (stopped) process.exitCode = 1;
}
