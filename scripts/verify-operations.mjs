import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'dotenv';
// Local synthetic recovery drill. Never run against an externally hosted personal workspace.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Queue } = require('bullmq');
const settings = parse(await readFile(new URL('../.env', import.meta.url)));
const base = 'http://127.0.0.1:43170/api/v1';
const headers = {
  Origin: 'http://127.0.0.1:43170',
  'X-Jobhunt-Client': 'web',
  'Content-Type': 'application/json',
};
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ password: settings.OWNER_PASSWORD }),
});
if (!login.ok) throw new Error('Local verification login failed.');
const cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith('jobhunt.sid='))
  ?.split(';')[0];
if (!cookie) throw new Error('Local session missing.');
async function request(path, body) {
  const response = await fetch(`${base}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...headers, Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Recovery check request failed (${response.status}).`);
  return response.json();
}
function docker(args) {
  const result = spawnSync('docker', ['compose', '--profile', 'app', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0)
    throw new Error('Project service operation failed. Inspect Docker service logs.');
}
async function wait(id, predicate, timeout = 75000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const run = await request(`operations/${id}`);
    if (predicate(run)) return run;
    await delay(1000);
  }
  throw new Error('Synthetic recovery operation did not reach the expected state.');
}
const queue = new Queue('jobhunt-operations', {
  connection: {
    host: '127.0.0.1',
    port: Number(settings.REDIS_PORT ?? 46379),
    maxRetriesPerRequest: 1,
  },
});
queue.on('error', () => {});
try {
  await queue.pause();
  const lost = await request('operations/check', { scenario: 'healthy' });
  await wait(lost.id, (run) => !!run.dispatchedAt);
  const job = await queue.getJob(`${lost.id}-0`);
  if (!job) throw new Error('Synthetic transport job missing before recovery check.');
  await job.remove();
  await queue.resume();
  const restored = await wait(lost.id, (run) => run.status === 'succeeded');
  if (restored.attempts.length !== 1)
    throw new Error('Queue reconciliation created duplicate attempts.');
  console.log('Outbox reconciliation passed after removal of a synthetic transport job.');
  const interrupted = await request('operations/check', { scenario: 'slow' });
  await wait(interrupted.id, (run) => run.status === 'running');
  docker(['kill', '--signal', 'SIGKILL', 'worker']);
  docker(['up', '--detach', 'worker']);
  const recovered = await wait(interrupted.id, (run) => run.status === 'succeeded');
  if (
    !recovered.attempts.some((attempt) => attempt.errorCode === 'WORKER_INTERRUPTED') ||
    recovered.attempts.length !== 2
  )
    throw new Error('Interrupted attempt was not preserved correctly.');
  console.log('Worker termination recovery passed; interrupted and successful attempts preserved.');
  docker(['stop', 'redis']);
  const outage = await request('operations/check', { scenario: 'healthy' });
  const queued = await request(`operations/${outage.id}`);
  if (queued.status !== 'queued') throw new Error('Operation was not queued during Redis outage.');
  docker(['start', 'redis']);
  await wait(outage.id, (run) => run.status === 'succeeded');
  console.log('Redis outage recovery passed; PostgreSQL retained the queued request.');
} finally {
  await queue.resume().catch(() => {});
  await queue.close();
  docker(['up', '--detach', 'redis', 'worker']);
}
