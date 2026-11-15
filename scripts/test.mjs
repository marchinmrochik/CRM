import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const storage = fileURLToPath(new URL(`../storage/test-${randomUUID()}/`, import.meta.url));
const storageRoot = fileURLToPath(new URL('../storage/', import.meta.url));
if (!storage.startsWith(storageRoot))
  throw new Error('Test storage escaped the workspace storage root.');
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
  DATABASE_HOST: '127.0.0.1',
  OWNER_PASSWORD: 'e2e-only-synthetic-owner-password',
  SESSION_SECRET: 'e2e-only-synthetic-session-secret-with-sufficient-length',
  AI_PROVIDER: 'disabled',
  STORAGE_PATH: storage,
};
const compose = ['compose', '-p', 'jobhunt-crm-tests', '-f', 'compose.e2e.yaml'];
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env.CI ? { ...process.env, STORAGE_PATH: storage } : env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
if (process.env.CI) {
  process.exitCode = await run(process.execPath, [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    ...process.argv.slice(2),
  ]);
} else
  try {
    await mkdir(storage, { recursive: true });
    if (
      await run('docker', [
        ...compose,
        'up',
        '--detach',
        '--wait',
        '--wait-timeout',
        '120',
        'postgres',
      ])
    )
      throw new Error('Disposable test database could not start.');
    if (await run('docker', [...compose, 'run', '--rm', '--no-deps', 'migrate']))
      throw new Error('Disposable test migrations failed. Build api image first.');
    process.exitCode = await run(process.execPath, [
      fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
      'run',
      ...process.argv.slice(2),
    ]);
  } finally {
    if (await run('docker', [...compose, 'down', '--volumes'])) process.exitCode = 1;
    // This UUID directory is created by this run under the ignored storage root.
    await rm(storage, { recursive: true, force: true });
  }
