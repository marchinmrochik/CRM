import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { setTimeout as delay } from 'node:timers/promises';

// One bounded live check per due source. Does not enable monitoring or bypass quotas.
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
headers.Cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith('jobhunt.sid='))
  ?.split(';')[0];
async function request(path, body) {
  const response = await fetch(`${base}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Discovery verification HTTP ${response.status}.`);
  return response.json();
}
for (const source of await request('discovery/sources')) {
  if (new Date(source.nextFetchAt) > new Date()) {
    console.log(`${source.name}: request interval active; no additional fetch.`);
    continue;
  }
  const run = await request(`discovery/sources/${source.connector}/import`, {});
  const deadline = Date.now() + 45000;
  let result;
  while (Date.now() < deadline) {
    result = await request(`operations/${run.id}`);
    if (['succeeded', 'failed', 'retrying'].includes(result.status)) break;
    await delay(1000);
  }
  console.log(
    JSON.stringify({
      source: source.name,
      status: result?.status,
      code: result?.errorCode,
      output: result?.output,
    }),
  );
  if (result?.status !== 'succeeded') process.exitCode = 1;
}
