import { z } from 'zod';
import { OperationError } from './ai.provider';

export const SOURCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const connectors = {
  remotive: {
    name: 'Remotive',
    endpoint: 'https://remotive.com/api/remote-jobs?category=software-dev',
    website: 'https://remotive.com/',
    coverage: 'Software development · 24-hour delay',
    intervalHours: 6,
  },
  arbeitnow: {
    name: 'Arbeitnow',
    endpoint: 'https://www.arbeitnow.com/api/job-board-api',
    website: 'https://www.arbeitnow.com/',
    coverage: 'Remote European jobs · first page only',
    intervalHours: 6,
  },
  jobicy: {
    name: 'Jobicy',
    endpoint: 'https://jobicy.com/api/v2/remote-jobs?count=200',
    website: 'https://jobicy.com/',
    coverage: 'Worldwide remote jobs · latest 200 from the seven-day feed',
    intervalHours: 6,
  },
  himalayas: {
    name: 'Himalayas',
    endpoint: 'https://himalayas.app/jobs/api?limit=20',
    website: 'https://himalayas.app/',
    coverage: 'Worldwide remote jobs · latest 100 · daily refresh',
    intervalHours: 24,
  },
  remoteok: {
    name: 'Remote OK',
    endpoint: 'https://remoteok.com/api',
    website: 'https://remoteok.com/',
    coverage: 'Worldwide remote jobs · public feed',
    intervalHours: 6,
  },
} as const;
export type Connector = keyof typeof connectors;
export const connectorSchema = z.enum(['remotive', 'arbeitnow', 'jobicy', 'himalayas', 'remoteok']);
export const sourceInterval = (connector: Connector) =>
  connectors[connector].intervalHours * 3600000;
export type ListingInput = {
  externalId: string;
  company: string;
  title: string;
  description: string;
  url: string;
  location: string;
  publishedAt: string | null;
};

export function publicUrl(value: string): boolean {
  try {
    const u = new URL(value),
      host = u.hostname.toLowerCase();
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === '443') &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) &&
      !/\.(local|internal|localhost|test|invalid)$/.test(host)
    );
  } catch {
    return false;
  }
}
export function plainText(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_, entity: string) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity]!,
    )
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
const text = z.string().min(1).max(200000);
const remotiveSchema = z.object({
  jobs: z
    .array(
      z.object({
        id: z.union([z.number().int().nonnegative(), text]),
        title: text,
        company_name: text,
        description: text,
        url: text,
        candidate_required_location: z.string().optional(),
        publication_date: z.string().optional(),
      }),
    )
    .max(500),
});
const arbeitnowSchema = z.object({
  data: z
    .array(
      z.object({
        slug: text,
        title: text,
        company_name: text,
        description: text,
        url: text,
        remote: z.boolean(),
        location: z.string(),
        created_at: z.number().optional(),
      }),
    )
    .max(500),
});
const jobicySchema = z.object({
  success: z.boolean().optional(),
  jobs: z
    .array(
      z.object({
        id: z.number().int().positive(),
        jobTitle: text,
        companyName: text,
        jobDescription: text,
        url: text,
        jobGeo: z.string().optional(),
        pubDate: z.string().optional(),
      }),
    )
    .max(200),
});
const himalayasSchema = z.object({
  jobs: z
    .array(
      z.object({
        guid: text,
        title: text,
        companyName: text,
        description: text,
        applicationLink: text,
        locationRestrictions: z
          .array(z.union([z.string(), z.object({ name: z.string() })]))
          .max(250),
        pubDate: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .max(20),
});
const remoteokSchema = z
  .array(
    z.union([
      z.object({ legal: text }),
      z.object({
        id: text,
        position: text,
        company: text,
        description: text,
        url: text,
        location: z.string().optional(),
        date: z.string().optional(),
      }),
    ]),
  )
  .max(500);
function publishedAt(value: string | number | undefined): string | null {
  if (value === undefined || value === '') return null;
  const date = new Date(typeof value === 'number' && value < 1e11 ? value * 1000 : value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid publication date');
  return date.toISOString();
}
export function normalize(connector: Connector, payload: unknown): ListingInput[] {
  try {
    const items: ListingInput[] =
      connector === 'remotive'
        ? remotiveSchema.parse(payload).jobs.map((j) => ({
            externalId: String(j.id),
            company: j.company_name,
            title: j.title,
            description: plainText(j.description),
            url: j.url,
            location: j.candidate_required_location || 'Unknown',
            publishedAt: publishedAt(j.publication_date),
          }))
        : connector === 'arbeitnow'
          ? arbeitnowSchema
              .parse(payload)
              .data.filter((j) => j.remote)
              .map((j) => ({
                externalId: j.slug,
                company: j.company_name,
                title: j.title,
                description: plainText(j.description),
                url: j.url,
                location: j.location || 'Unknown',
                publishedAt: publishedAt(j.created_at),
              }))
          : connector === 'jobicy'
            ? (() => {
                const feed = jobicySchema.parse(payload);
                if (feed.success === false) throw new Error('Source rejected the request');
                return feed.jobs.map((j) => ({
                  externalId: String(j.id),
                  title: j.jobTitle,
                  company: j.companyName,
                  description: plainText(j.jobDescription),
                  url: j.url,
                  location: j.jobGeo || 'Unknown',
                  publishedAt: publishedAt(j.pubDate),
                }));
              })()
            : connector === 'himalayas'
              ? himalayasSchema.parse(payload).jobs.map((j) => ({
                  externalId: j.guid,
                  title: j.title,
                  company: j.companyName,
                  description: plainText(j.description),
                  url: j.applicationLink,
                  location:
                    j.locationRestrictions
                      .map((l) => (typeof l === 'string' ? l : l.name))
                      .join(', ') || 'Worldwide',
                  publishedAt: publishedAt(j.pubDate),
                }))
              : remoteokSchema
                  .parse(payload)
                  .filter((j) => 'id' in j)
                  .map((j) => ({
                    externalId: j.id,
                    title: j.position,
                    company: j.company,
                    description: plainText(j.description),
                    url: j.url,
                    location: j.location || 'Unknown',
                    publishedAt: publishedAt(j.date),
                  }));
    const ids = new Set<string>();
    for (const item of items) {
      if (
        !publicUrl(item.url) ||
        !item.description ||
        item.description.length > 60000 ||
        item.title.length > 200 ||
        item.company.length > 200 ||
        item.externalId.length > 400 ||
        item.location.length > 5000 ||
        ids.has(item.externalId)
      )
        throw new Error('Invalid record');
      ids.add(item.externalId);
      const attributionHosts: Partial<Record<Connector, string>> = {
        remotive: 'remotive.com',
        jobicy: 'jobicy.com',
        himalayas: 'himalayas.app',
        remoteok: 'remoteok.com',
      };
      if (attributionHosts[connector] && new URL(item.url).hostname !== attributionHosts[connector])
        throw new Error('Invalid attribution URL');
    }
    return items;
  } catch {
    throw new OperationError(
      'SOURCE_FORMAT',
      'Source format changed or contained invalid records. No listings were imported.',
    );
  }
}
export async function fetchListings(
  connector: Connector,
  fetcher: typeof fetch = fetch,
): Promise<ListingInput[]> {
  const endpoint = connectors[connector]?.endpoint;
  if (!endpoint) throw new OperationError('SOURCE_DESTINATION', 'Unsupported source destination.');
  const interval = sourceInterval(connector);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const items: ListingInput[] = [];
    let nextEndpoint: string = endpoint;
    const cursors = new Set<string>();
    for (let page = 0; page < (connector === 'himalayas' ? 5 : 1); page++) {
      const response = await fetcher(nextEndpoint, {
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'JobSearchOS-personal-CRM/1.0' },
      });
      if (!response.ok) {
        const retry = response.status === 429 || response.status >= 500;
        const error = new OperationError(
          `SOURCE_HTTP_${response.status}`,
          'Source is unavailable. Inspect attempt history; retry respects the source request interval.',
          retry,
        );
        const retryAfter = response.headers.get('retry-after');
        const seconds =
          retryAfter && /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1000
            : retryAfter
              ? Date.parse(retryAfter) - Date.now()
              : 0;
        error.retryAfterMs = Math.max(
          interval,
          Number.isFinite(seconds) ? Math.min(seconds, 7 * 86400000) : 0,
        );
        throw error;
      }
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new OperationError('SOURCE_FORMAT', 'Source did not return JSON.');
      const reader = response.body?.getReader();
      if (!reader) throw new OperationError('SOURCE_FORMAT', 'Source response was empty.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new OperationError('SOURCE_TOO_LARGE', 'Source exceeded the import size limit.');
        }
        chunks.push(value);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new OperationError('SOURCE_FORMAT', 'Source returned invalid JSON.');
      }
      items.push(...normalize(connector, payload));
      if (connector !== 'himalayas') break;
      const cursorResult = z
        .object({ nextCursor: z.string().min(1).max(2048).nullish() })
        .safeParse(payload);
      if (!cursorResult.success)
        throw new OperationError('SOURCE_FORMAT', 'Source pagination format changed.');
      const cursor = cursorResult.data.nextCursor;
      if (!cursor) break;
      if (cursors.has(cursor))
        throw new OperationError('SOURCE_FORMAT', 'Source repeated a pagination cursor.');
      cursors.add(cursor);
      const next = new URL(endpoint);
      next.searchParams.set('cursor', cursor);
      nextEndpoint = next.href;
    }
    if (new Set(items.map((i) => i.externalId)).size !== items.length)
      throw new OperationError(
        'SOURCE_FORMAT',
        'Source repeated a listing across pages. No listings were imported.',
      );
    return items;
  } catch (error) {
    if (error instanceof OperationError) throw error;
    const safe = new OperationError(
      'SOURCE_NETWORK',
      'Source request timed out or could not connect.',
      true,
    );
    safe.retryAfterMs = interval;
    throw safe;
  } finally {
    clearTimeout(timer);
  }
}

export const searchSchema = z
  .object({
    keywords: z.string().trim().max(150).default(''),
    location: z.string().trim().max(100).default(''),
    company: z.string().trim().max(100).default(''),
    postedWithin: z.enum(['', '7', '30', '90']).default(''),
    sort: z.enum(['published', 'imported']).default('published'),
    connector: z.union([connectorSchema, z.literal('')]).default(''),
    disposition: z.enum(['', 'inbox', 'shortlisted', 'dismissed']).default(''),
    unseen: z.boolean().default(false),
  })
  .strict();
export type SearchFilters = z.infer<typeof searchSchema>;
export function matchingReasons(item: ListingInput, filters: SearchFilters): string[] {
  const haystack = `${item.title}\n${item.description}`.toLowerCase();
  const terms = [...new Set(filters.keywords.toLowerCase().split(/\s+/).filter(Boolean))];
  return [
    ...terms.filter((term) => haystack.includes(term)).map((term) => `Keyword: ${term}`),
    ...(filters.location && item.location.toLowerCase().includes(filters.location.toLowerCase())
      ? [`Location: ${filters.location}`]
      : []),
  ];
}
