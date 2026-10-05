export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
    public fields?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? 'GET' : method,
    headers:
      body === undefined
        ? {}
        : {
            'X-Jobhunt-Client': 'web',
            ...(multipart ? {} : { 'Content-Type': 'application/json' }),
          },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Cannot reach the API. Check System activity and retry.' }));
    throw new ApiError(
      error.message ?? error.reason ?? 'Request failed.',
      response.status,
      error.requestId,
      error.fields,
    );
  }
  return response.json() as Promise<T>;
}

export interface Company {
  id: string;
  name: string;
  website?: string;
  archived: boolean;
}
export interface Vacancy {
  id: string;
  title: string;
  description: string;
  source: string;
  url?: string;
  location: string;
  workMode: string;
  eligibility: string;
  disposition: string;
  companyId: string;
  company: Company;
  _count?: { applications: number };
}
export interface Resume {
  id: string;
  name: string;
  size: number;
}
export interface Action {
  id: string;
  title: string;
  dueAt: string;
  completedAt?: string;
  application?: Application;
}
export interface Interview {
  id: string;
  type: string;
  scheduledAt: string;
  timezone: string;
  status: string;
  outcome?: string;
}
export interface Application {
  id: string;
  status: string;
  revision: number;
  createdAt: string;
  submittedAt?: string;
  vacancy: Vacancy;
  vacancySnapshot: { title: string; company: string; description: string; url?: string };
  resume?: Resume;
  noResume: boolean;
  events: { id: string; label: string; occurredAt: string; recordedAt: string }[];
  notes: { id: string; content: string; createdAt: string }[];
  actions: Action[];
  interviews: Interview[];
}
export interface List {
  items: Application[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Overview {
  groups: { status: string; _count: { _all: number } }[];
  vacancies: number;
  actions: Action[];
  submitted: number;
}
export interface Health {
  api: string;
  database: string;
  observedAt: string;
  startedAt: string;
  worker: string;
  ai: string;
}
export interface Source {
  name: string;
  url: string;
  category: string;
  connection: string;
}
export const statuses = [
  'draft',
  'applied',
  'in_progress',
  'offer_received',
  'accepted',
  'rejected',
  'withdrawn',
];
export const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase());
export const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
export const iso = (value: FormDataEntryValue | null) => new Date(String(value)).toISOString();
