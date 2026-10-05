import { z } from 'zod';

export const statuses = [
  'draft',
  'applied',
  'in_progress',
  'offer_received',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export const terminal = new Set<string>(['accepted', 'rejected', 'withdrawn']);
export const companyInput = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.union([z.url().startsWith('https://'), z.literal('')]).optional(),
});
export const vacancyInput = z.object({
  companyId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(60000),
  url: z.union([z.url().refine((s) => /^https?:\/\//.test(s)), z.literal('')]).optional(),
  source: z.string().trim().min(1).max(100).default('Manual'),
  location: z.string().trim().max(200).default('Unknown'),
  workMode: z.enum(['remote', 'hybrid', 'office']).default('remote'),
  eligibility: z.enum(['unknown', 'eligible', 'ineligible']).default('unknown'),
});
export const transitionInput = z.object({
  status: z.enum(statuses),
  revision: z.number().int().nonnegative(),
  submittedAt: z.iso.datetime().optional(),
  resumeId: z.uuid().optional(),
  noResume: z.boolean().default(false),
  reopen: z.boolean().default(false),
});
export function transitionProblem(
  current: string,
  next: string,
  submitted: boolean,
  reopen: boolean,
): string | null {
  if (current === next) return 'Application already has this status.';
  if (terminal.has(current) && !reopen) return 'Confirm reopening a completed application.';
  if (submitted && next === 'draft') return 'A submitted application cannot return to draft.';
  if (!submitted && !['applied', 'withdrawn'].includes(next))
    return 'Record submission before advancing the application.';
  if (next === 'accepted' && current !== 'offer_received')
    return 'Record an offer before accepting it.';
  return null;
}
