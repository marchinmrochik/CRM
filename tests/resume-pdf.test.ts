import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { renderResume } from '../apps/api/src/resume.pdf';
import { profileSchema, contentSchema } from '../apps/api/src/resume.domain';
it('bounds pathological multi-page exports instead of publishing oversized documents', async () => {
  const profile = profileSchema.parse({
    name: 'Alex Morgan',
    headline: 'Frontend Engineer',
    email: 'alex@example.com',
    phone: '',
    location: '',
    website: '',
    facts: [],
  });
  const content = contentSchema.parse({
    headline: profile.headline,
    blocks: Array.from({ length: 12 }, () => ({
      factId: randomUUID(),
      kind: 'experience',
      title: 'Long experience',
      context: 'Northstar Labs',
      text: 'Verified work.\n'.repeat(130),
    })),
  });
  await expect(renderResume(profile, content).then(() => undefined)).rejects.toThrow(
    '20-page export limit',
  );
});
