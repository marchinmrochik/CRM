import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  profileSchema,
  contentSchema,
  fromProfile,
  evidenceProblem,
  resumeDiff,
  type Requirement,
} from '../apps/api/src/resume.domain';
const id = randomUUID();
const profile = profileSchema.parse({
  name: 'Alex Morgan',
  headline: 'Frontend Engineer',
  email: 'alex@example.com',
  phone: '',
  location: 'Kyiv',
  website: '',
  facts: [
    {
      id,
      kind: 'experience',
      title: 'Frontend Engineer',
      context: 'Northstar Labs | 2020 - 2026',
      text: 'Built React applications.',
      approved: true,
    },
    { id: randomUUID(), kind: 'skill', title: 'Unconfirmed skill', text: 'Rust', approved: false },
  ],
});
describe('Resume evidence and review', () => {
  it('excludes unapproved facts and rejects invented evidence or section category', () => {
    const content = fromProfile(profile);
    expect(content.blocks).toHaveLength(1);
    expect(
      evidenceProblem(
        profile,
        { ...content, blocks: [{ ...content.blocks[0], factId: randomUUID() }] },
        [],
        '',
      ),
    ).toContain('approved profile fact');
    expect(
      evidenceProblem(
        profile,
        { ...content, blocks: [{ ...content.blocks[0], kind: 'education' }] },
        [],
        '',
      ),
    ).toContain('approved profile fact');
  });
  it('requires original quotes and evidence for supported claims; preserves visible gaps', () => {
    const r: Requirement = {
      id: randomUUID(),
      quote: 'React',
      kind: 'mandatory',
      state: 'supported',
      factIds: [],
    };
    const content = fromProfile(profile);
    expect(evidenceProblem(profile, content, [r], 'React and TypeScript')).toBe(
      'Supported requirements need evidence.',
    );
    expect(
      evidenceProblem(profile, content, [{ ...r, factIds: [id] }], 'React and TypeScript'),
    ).toBeNull();
    expect(
      evidenceProblem(
        profile,
        content,
        [{ ...r, quote: 'Fabricated requirement', factIds: [id] }],
        'React and TypeScript',
      ),
    ).toContain('quote');
    expect(
      evidenceProblem(profile, content, [{ ...r, state: 'unsupported' }], 'React and TypeScript'),
    ).toBeNull();
    expect(
      evidenceProblem(
        profile,
        content,
        [{ ...r, state: 'unsupported', factIds: [id] }],
        'React and TypeScript',
      ),
    ).toContain('cannot claim');
  });
  it('captures the exact wording change without mutating baseline; rejects duplicate blocks', () => {
    const before = fromProfile(profile);
    const after = {
      ...before,
      blocks: [{ ...before.blocks[0], text: 'Built accessible React applications.' }],
    };
    expect(resumeDiff(before, after)).toEqual([
      {
        field: `text:${id}`,
        before: 'Built React applications.',
        after: 'Built accessible React applications.',
      },
    ]);
    expect(before.blocks[0].text).toBe('Built React applications.');
    expect(
      contentSchema.safeParse({ ...before, blocks: [...before.blocks, ...before.blocks] }).success,
    ).toBe(false);
  });
});
