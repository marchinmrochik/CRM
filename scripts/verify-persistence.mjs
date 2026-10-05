import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';

// Local all-container smoke check; never use against a hosted production workspace.
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
if (!cookie) throw new Error('Local session cookie missing.');
async function request(path) {
  const response = await fetch(`${base}/${path}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`Local persistence check failed (${response.status}).`);
  return response;
}
const before = await (await request('export/json')).json();
const resume = before.resumes[0];
const digest = async (id) =>
  createHash('sha256')
    .update(Buffer.from(await (await request(`resumes/${id}/download`)).arrayBuffer()))
    .digest('hex');
const beforeHash = resume ? await digest(resume.id) : null;
function docker(args) {
  const result = spawnSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0)
    throw new Error('Project container restart failed. Inspect docker compose status/logs.');
}
docker(['restart', 'postgres']);
docker(['up', '--detach', '--wait', '--wait-timeout', '120', 'postgres']);
docker(['--profile', 'app', 'restart', 'api', 'web']);
docker(['--profile', 'app', 'up', '--detach', '--wait', '--wait-timeout', '180']);
const me = await (await request('auth/me')).json();
if (!me.authenticated) throw new Error('Session did not survive restart.');
const after = await (await request('export/json')).json();
for (const key of ['companies', 'vacancies', 'applications', 'resumes']) {
  if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    throw new Error(`Persisted ${key} changed across restart.`);
}
if (resume && (await digest(resume.id)) !== beforeHash)
  throw new Error('PDF changed across restart.');
console.log(
  'Persistence passed: domain data, event histories, authenticated session and uploaded PDF survived project database/API/web restart.',
);
