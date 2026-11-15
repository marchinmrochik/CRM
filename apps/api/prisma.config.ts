import { defineConfig } from 'prisma/config';
import { migrationDatabaseUrl as databaseUrl } from './src/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl },
});
