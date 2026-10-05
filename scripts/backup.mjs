import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, cp } from 'node:fs/promises';
import { resolve, join, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
const settings = parse(await readFile(join(root, '.env')));
const user = settings.POSTGRES_USER;
const database = settings.POSTGRES_DB;
const backupRoot = join(root, 'backups');
const storage = join(root, 'storage/resumes');
function run(args, input, output) {
  return new Promise((resolveResult, reject) => {
    const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', ...args], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const streams = [];
    if (input) streams.push(pipeline(createReadStream(input), child.stdin));
    else child.stdin.end();
    if (output) streams.push(pipeline(child.stdout, createWriteStream(output, { flags: 'wx' })));
    else
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    child.on('error', reject);
    child.on('close', async (code) => {
      try {
        await Promise.all(streams);
        if (code !== 0) throw new Error(`Database command failed: ${stderr}`);
        resolveResult(stdout.trim());
      } catch (error) {
        reject(error);
      }
    });
  });
}
const sql = (db, statement) =>
  run(['psql', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement]);
const hash = async (file) =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const mode = process.argv[2];
if (mode === 'create') {
  const directory = join(
    backupRoot,
    new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-'),
  );
  await mkdir(directory, { recursive: true });
  await run(
    ['pg_dump', '-U', user, '-d', database, '--format=custom'],
    undefined,
    join(directory, 'database.dump'),
  );
  await mkdir(join(directory, 'resumes'));
  try {
    await cp(storage, join(directory, 'resumes'), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const artifacts = [];
  for (const file of await readdir(join(directory, 'resumes')))
    artifacts.push({ file, checksum: await hash(join(directory, 'resumes', file)) });
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        createdAt: new Date().toISOString(),
        database,
        dumpChecksum: await hash(join(directory, 'database.dump')),
        artifacts,
      },
      null,
      2,
    ),
  );
  console.log(
    `Backup created: backups/${basename(directory)}. Run verification before relying on it.`,
  );
} else if (mode === 'verify') {
  const directory = resolve(root, process.argv[3] ?? '');
  if (!directory.startsWith(backupRoot + sep))
    throw new Error('Verification requires a backup directory inside this project backups folder.');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if ((await hash(join(directory, 'database.dump'))) !== manifest.dumpChecksum)
    throw new Error('Database dump checksum mismatch.');
  const target = `jobhunt_restore_${Date.now()}`;
  if (!/^jobhunt_restore_[0-9]+$/.test(target)) throw new Error('Invalid isolated restore target.');
  await sql('postgres', `CREATE DATABASE "${target}"`);
  try {
    await run(
      ['pg_restore', '-U', user, '-d', target, '--exit-on-error', '--no-owner', '--no-acl'],
      join(directory, 'database.dump'),
    );
    const rows = JSON.parse(
      await sql(
        target,
        "SELECT coalesce(json_agg(json_build_object('file',\"storageKey\",'checksum',checksum)),'[]'::json) FROM \"ResumeArtifact\"",
      ),
    );
    for (const row of rows) {
      if (!/^[a-zA-Z0-9-]+\.pdf$/.test(row.file)) throw new Error('Unsafe artifact key in backup.');
      if ((await hash(join(directory, 'resumes', row.file))) !== row.checksum)
        throw new Error(`Artifact checksum mismatch: ${row.file}`);
    }
    console.log(
      `Isolated restore passed; ${rows.length} referenced artifacts verified. Live database was not overwritten.`,
    );
  } finally {
    await sql('postgres', `DROP DATABASE "${target}"`);
  }
} else if (mode === 'restore') {
  throw new Error(
    'In-place restore is intentionally not automated. Follow docs/backup-restore.md for a reviewed recovery.',
  );
} else {
  console.log('Usage: node scripts/backup.mjs create | verify backups/<directory>');
}
