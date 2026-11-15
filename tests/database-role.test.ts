import { beforeAll, afterAll, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { runtimeRoleSql } from '../scripts/runtime-role-sql.mjs';
import { settings, migrationDatabaseUrl } from '../apps/api/src/config';
const { Pool } = createRequire(new URL('../apps/api/package.json', import.meta.url))('pg');
const pool = new Pool({ connectionString: migrationDatabaseUrl, max: 1 });
beforeAll(async () => {
  await pool.query(
    runtimeRoleSql(settings, 'jobhunt_runtime_00000000', 'e2e-only-synthetic-runtime-password'),
  );
});
afterAll(async () => {
  await pool.end();
});
it('denies administrative and immutable-table writes while permitting required application work', async () => {
  const {
    rows: [role],
  } = await pool.query(
    "SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname='jobhunt_runtime_00000000'",
  );
  expect(Object.values(role).every((value) => value === false)).toBe(true);
  const {
    rows: [grants],
  } = await pool.query(
    `SELECT has_table_privilege('jobhunt_runtime_00000000','"ResumeVersion"','UPDATE') AS version_update,has_table_privilege('jobhunt_runtime_00000000','"ApplicationEvent"','DELETE') AS event_delete,has_table_privilege('jobhunt_runtime_00000000','"_prisma_migrations"','INSERT') AS migration_write,has_table_privilege('jobhunt_runtime_00000000','"OperationRun"','UPDATE') AS operation_update`,
  );
  expect(grants).toEqual({
    version_update: false,
    event_delete: false,
    migration_write: false,
    operation_update: true,
  });
});
it('rejects schema changes under the runtime role', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE jobhunt_runtime_00000000');
    await expect(
      client.query('CREATE TABLE forbidden_runtime_fixture(id int)'),
    ).rejects.toMatchObject({ code: '42501' });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
