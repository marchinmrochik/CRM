import { createRequire } from 'node:module';
import { runtimeRoleSql } from './runtime-role-sql.mjs';
const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');
if (process.env.POSTGRES_DB !== 'jobhunt_e2e' || process.env.POSTGRES_USER !== 'jobhunt_test')
  throw new Error('This helper is restricted to the disposable container database.');
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});
try {
  await pool.query(
    runtimeRoleSql(process.env, 'jobhunt_runtime_00000000', 'e2e-only-synthetic-runtime-password'),
  );
  console.log('Disposable runtime role configured.');
} finally {
  await pool.end();
}
