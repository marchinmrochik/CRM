import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const schema = z.object({
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(20),
  POSTGRES_PORT: z.coerce.number().int().default(45432),
  API_PORT: z.coerce.number().int().default(43171),
  SESSION_SECRET: z.string().min(32),
  OWNER_PASSWORD: z.string().min(16),
  DATABASE_HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:43170'),
  STORAGE_PATH: z.string().optional(),
});
const result = schema.safeParse(process.env);
if (!result.success)
  throw new Error(
    `Invalid configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
export const settings = result.data;
for (const port of [settings.POSTGRES_PORT, settings.API_PORT]) {
  if (port < 1024 || port > 65535 || [3000, 5000, 8000, 1433, 5432, 6379].includes(port))
    throw new Error('Invalid or reserved host port');
}
export const databaseUrl = `postgresql://${encodeURIComponent(settings.POSTGRES_USER)}:${encodeURIComponent(settings.POSTGRES_PASSWORD)}@${settings.DATABASE_HOST}:${settings.DATABASE_HOST === 'postgres' ? 5432 : settings.POSTGRES_PORT}/${encodeURIComponent(settings.POSTGRES_DB)}`;
export const storagePath = settings.STORAGE_PATH ?? resolve(__dirname, '../../../storage/resumes');
