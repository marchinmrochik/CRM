import { z } from 'zod';
export const factKinds = ['summary', 'skill', 'experience', 'achievement', 'education'] as const;
const text = z.string().trim().min(1).max(2000);
export const factSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(factKinds),
    title: z.string().trim().min(1).max(160),
    context: z.string().trim().max(300).default(''),
    text,
    approved: z.boolean(),
  })
  .strict();
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    headline: z.string().trim().max(160),
    email: z.union([z.email(), z.literal('')]),
    phone: z.string().trim().max(80),
    location: z.string().trim().max(200),
    website: z.union([z.url().startsWith('https://'), z.literal('')]),
    facts: z
      .array(factSchema)
      .max(60)
      .refine(
        (facts) => new Set(facts.map((f) => f.id)).size === facts.length,
        'Fact IDs must be unique.',
      ),
  })
  .strict()
  .refine(
    (p) => p.facts.reduce((sum, f) => sum + f.text.length, 0) <= 40000,
    'Profile text exceeds the size limit.',
  );
export const blockSchema = z
  .object({
    factId: z.uuid(),
    kind: z.enum(factKinds),
    title: z.string().trim().min(1).max(160),
    context: z.string().trim().max(300),
    text,
  })
  .strict();
export const contentSchema = z
  .object({
    headline: z.string().trim().max(160),
    blocks: z
      .array(blockSchema)
      .min(1)
      .max(60)
      .refine(
        (b) => new Set(b.map((x) => x.factId)).size === b.length,
        'One block per fact is allowed.',
      ),
  })
  .strict()
  .refine(
    (c) => c.blocks.reduce((sum, b) => sum + b.text.length, 0) <= 40000,
    'Resume text exceeds the size limit.',
  );
export const requirementSchema = z
  .object({
    id: z.uuid(),
    quote: z.string().trim().min(1).max(1500),
    kind: z.enum(['mandatory', 'preferred', 'responsibility', 'constraint']),
    state: z.enum(['supported', 'partially_supported', 'needs_confirmation', 'unsupported']),
    factIds: z
      .array(z.uuid())
      .max(60)
      .refine((ids) => new Set(ids).size === ids.length, 'Evidence IDs must be unique.'),
  })
  .strict();
export const requirementsSchema = z
  .array(requirementSchema)
  .max(40)
  .refine((r) => new Set(r.map((x) => x.id)).size === r.length, 'Requirement IDs must be unique.')
  .refine(
    (r) => r.reduce((sum, x) => sum + x.quote.length, 0) <= 10000,
    'Requirement quotes exceed the size limit.',
  );
export type ProfileContent = z.infer<typeof profileSchema>;
export type ResumeContent = z.infer<typeof contentSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export function fromProfile(profile: ProfileContent): ResumeContent {
  return {
    headline: profile.headline,
    blocks: profile.facts
      .filter((f) => f.approved)
      .sort((a, b) => factKinds.indexOf(a.kind) - factKinds.indexOf(b.kind))
      .map(({ id, kind, title, context, text }) => ({ factId: id, kind, title, context, text })),
  };
}
export function evidenceProblem(
  profile: ProfileContent,
  content: ResumeContent,
  requirements: Requirement[],
  description: string,
): string | null {
  const facts = new Map(profile.facts.filter((f) => f.approved).map((f) => [f.id, f]));
  for (const block of content.blocks) {
    const fact = facts.get(block.factId);
    if (!fact || fact.kind !== block.kind)
      return 'Every resume block must reference an approved profile fact.';
  }
  for (const r of requirements) {
    if (!description.includes(r.quote))
      return 'Requirements must quote the captured vacancy description.';
    if (r.factIds.some((id) => !facts.has(id)))
      return 'Requirement evidence must reference approved profile facts.';
    if (['supported', 'partially_supported'].includes(r.state) && r.factIds.length === 0)
      return 'Supported requirements need evidence.';
    if (r.state === 'unsupported' && r.factIds.length > 0)
      return 'Unsupported requirements cannot claim evidence.';
  }
  return null;
}
export function resumeDiff(before: ResumeContent, after: ResumeContent) {
  const changes: { field: string; before: string; after: string }[] = [];
  if (before.headline !== after.headline)
    changes.push({ field: 'headline', before: before.headline, after: after.headline });
  const old = new Map(before.blocks.map((b) => [b.factId, b]));
  const next = new Map(after.blocks.map((b) => [b.factId, b]));
  for (const [id, b] of old)
    if (!next.has(id))
      changes.push({
        field: `block:${id}`,
        before: [b.title, b.context, b.text].filter(Boolean).join('\n'),
        after: '',
      });
  for (const [id, b] of next) {
    const a = old.get(id);
    if (!a)
      changes.push({
        field: `block:${id}`,
        before: '',
        after: [b.title, b.context, b.text].filter(Boolean).join('\n'),
      });
    else
      for (const field of ['title', 'context', 'text'] as const)
        if (a[field] !== b[field])
          changes.push({ field: `${field}:${id}`, before: a[field], after: b[field] });
  }
  const a = before.blocks.map((b) => b.factId).filter((id) => next.has(id));
  const b = after.blocks.map((b) => b.factId).filter((id) => old.has(id));
  if (a.join() !== b.join())
    changes.push({
      field: 'order',
      before: a.map((id) => old.get(id)!.title).join(' → '),
      after: b.map((id) => next.get(id)!.title).join(' → '),
    });
  return changes;
}
