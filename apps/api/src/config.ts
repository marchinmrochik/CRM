import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const schema = z
  .object({
    APP_ROLE: z.enum(['api', 'worker', 'migrate']).default('api'),
    POSTGRES_DB: z.string().min(1),
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(20),
    RUNTIME_DATABASE_USER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    RUNTIME_DATABASE_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(20).optional(),
    ),
    POSTGRES_PORT: z.coerce.number().int().default(45432),
    API_PORT: z.coerce.number().int().default(43171),
    SESSION_SECRET: z.string().min(32).optional(),
    OWNER_PASSWORD: z.string().min(16).max(200).optional(),
    COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    DATABASE_HOST: z.string().default('127.0.0.1'),
    WEB_ORIGIN: z.string().url().default('http://127.0.0.1:43170'),
    STORAGE_PATH: z.string().optional(),
    REDIS_HOST: z.string().default('127.0.0.1'),
    REDIS_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),
    REDIS_PORT: z.coerce.number().int().default(46379),
    WORKER_HEALTH_PORT: z.coerce.number().int().default(43172),
    AI_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
    OPENAI_MODEL: z.string().max(100).default(''),
    OPENAI_API_KEY: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.APP_ROLE === 'api')
      for (const field of ['SESSION_SECRET', 'OWNER_PASSWORD'] as const)
        if (!value[field])
          ctx.addIssue({ code: 'custom', path: [field], message: 'Required for API role' });
    if (Boolean(value.RUNTIME_DATABASE_USER) !== Boolean(value.RUNTIME_DATABASE_PASSWORD))
      ctx.addIssue({
        code: 'custom',
        path: ['RUNTIME_DATABASE_USER'],
        message: 'Runtime database credentials must be configured together',
      });
    try {
      const origin = new URL(value.WEB_ORIGIN);
      if (
        origin.origin !== value.WEB_ORIGIN ||
        !['http:', 'https:'].includes(origin.protocol) ||
        (origin.protocol === 'http:' &&
          !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) ||
        (origin.protocol === 'https:' && value.COOKIE_SECURE !== 'true')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message: 'Use a loopback HTTP origin or HTTPS with secure cookies',
        });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'Invalid origin' });
    }
  });
const result = schema.safeParse(process.env);
if (!result.success)
  throw new Error(
    `Invalid configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
  );
export const settings = result.data;
for (const port of [
  settings.POSTGRES_PORT,
  settings.API_PORT,
  settings.REDIS_PORT,
  settings.WORKER_HEALTH_PORT,
]) {
  if (port < 1024 || port > 65535 || [3000, 5000, 8000, 1433, 5432, 6379].includes(port))
    throw new Error('Invalid or reserved host port');
}
const connection = (user: string, password: string) =>
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${settings.DATABASE_HOST}:${settings.DATABASE_HOST === 'postgres' ? 5432 : settings.POSTGRES_PORT}/${encodeURIComponent(settings.POSTGRES_DB)}`;
export const migrationDatabaseUrl = connection(settings.POSTGRES_USER, settings.POSTGRES_PASSWORD);
export const databaseUrl =
  settings.APP_ROLE !== 'migrate' &&
  settings.RUNTIME_DATABASE_USER &&
  settings.RUNTIME_DATABASE_PASSWORD
    ? connection(settings.RUNTIME_DATABASE_USER, settings.RUNTIME_DATABASE_PASSWORD)
    : migrationDatabaseUrl;
export const storagePath = settings.STORAGE_PATH ?? resolve(__dirname, '../../../storage/resumes');
