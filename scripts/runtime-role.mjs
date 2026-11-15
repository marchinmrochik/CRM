import { runtimeRoleSql } from './runtime-role-sql.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';
const root = fileURLToPath(new URL('../', import.meta.url));
const path = new URL('../.env', import.meta.url);
const source = await readFile(path, 'utf8'),
  settings = parse(source);
const user = settings.RUNTIME_DATABASE_USER || `jobhunt_runtime_${randomBytes(4).toString('hex')}`;
const password = settings.RUNTIME_DATABASE_PASSWORD || randomBytes(32).toString('base64url');
const redis = settings.REDIS_PASSWORD || randomBytes(32).toString('base64url');
if (!/^jobhunt_runtime_[a-f0-9]{8}$/.test(user))
  throw new Error('Unexpected runtime role name. Review it before provisioning.');
const sql = runtimeRoleSql(settings, user, password);
await new Promise((resolve, reject) => {
  const child = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      settings.POSTGRES_USER,
      '-d',
      settings.POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { cwd: root, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  child.stderr.resume();
  child.on('error', () => reject(new Error('Database role setup could not start.')));
  child.on('close', (code) =>
    code === 0
      ? resolve()
      : reject(new Error('Database role setup failed; no credentials were printed.')),
  );
  child.stdin.end(sql);
});
let updated = source;
for (const [key, value] of Object.entries({
  RUNTIME_DATABASE_USER: user,
  RUNTIME_DATABASE_PASSWORD: password,
  REDIS_PASSWORD: redis,
})) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  updated = regex.test(updated)
    ? updated.replace(regex, line)
    : updated.trimEnd() + '\n' + line + '\n';
}
await writeFile(path, updated, { mode: 0o600 });
console.log(
  'Runtime role and Redis credentials configured privately. Restart API/worker/Redis to apply. Re-run after migrations to reapply immutable-table grants.',
);
