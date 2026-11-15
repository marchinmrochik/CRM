import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OpenAiProvider, validateAnalysis, type AnalysisInput } from '../apps/api/src/ai.provider';
import { profileSchema, fromProfile } from '../apps/api/src/resume.domain';
const factId = randomUUID();
const profile = profileSchema.parse({
  name: 'Private candidate',
  headline: 'Engineer',
  email: 'private@example.com',
  phone: 'private-phone',
  website: '',
  location: 'Private city',
  facts: [
    { id: factId, kind: 'skill', title: 'Skills', text: 'React', approved: true },
    {
      id: randomUUID(),
      kind: 'skill',
      title: 'Unapproved',
      text: 'Unapproved-secret',
      approved: false,
    },
  ],
});
const input: AnalysisInput = {
  draftId: randomUUID(),
  revision: 1,
  profileRevision: 1,
  profile,
  content: fromProfile(profile),
  vacancy: { description: 'React required' },
};
const signal = () => new AbortController().signal;
describe('AI provider boundary without network or API keys', () => {
  it('rejects empty and interrupted bodies without disclosing internal errors', async () => {
    await expect(
      new OpenAiProvider('test', 'test', vi.fn().mockResolvedValue(new Response(null))).analyze(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error('private upstream internals'));
      },
    });
    await expect(
      new OpenAiProvider('test', 'test', vi.fn().mockResolvedValue(new Response(stream))).analyze(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      message: 'Provider response timed out or could not be read.',
    });
  });
  it('accepts valid evidence-bound suggestions', () => {
    expect(validateAnalysis({ requirements: [], suggestions: [] }, input)).toEqual({
      requirements: [],
      suggestions: [],
    });
  });
  it.each(['missing', 'duplicate', 'stale'])('rejects %s block references', (kind) => {
    const s = {
      id: randomUUID(),
      factId: kind === 'missing' ? randomUUID() : factId,
      before: kind === 'stale' ? 'Changed' : 'React',
      after: 'React interfaces',
      reason: 'Clarity',
    };
    expect(() =>
      validateAnalysis(
        { requirements: [], suggestions: kind === 'duplicate' ? [s, s] : [s] },
        input,
      ),
    ).toThrow('invalid or duplicate');
  });
  it('rejects invalid contracts and invented requirement quotes', () => {
    expect(() =>
      validateAnalysis({ requirements: [], suggestions: [], extra: true }, input),
    ).toThrow('contract');
    expect(() =>
      validateAnalysis(
        {
          requirements: [
            {
              id: randomUUID(),
              kind: 'mandatory',
              state: 'unsupported',
              quote: 'Kubernetes',
              factIds: [],
            },
          ],
          suggestions: [],
        },
        input,
      ),
    ).toThrow('validation');
  });
  it('excludes personal contacts and unapproved facts from outbound payload', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            { content: [{ type: 'output_text', text: '{"requirements":[],"suggestions":[]}' }] },
          ],
        }),
      ),
    );
    expect(
      await new OpenAiProvider('test-key', 'test-model', request).analyze(input, signal()),
    ).toEqual({ requirements: [], suggestions: [] });
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    for (const value of [
      'private@example.com',
      'private-phone',
      'Private city',
      'Unapproved-secret',
    ])
      expect(body.input).not.toContain(value);
    expect(request.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    expect(request.mock.calls[0][1].redirect).toBe('error');
  });
  it.each([
    [429, 'PROVIDER_RATE_LIMIT', true],
    [500, 'PROVIDER_HTTP', true],
    [401, 'PROVIDER_HTTP', false],
  ])('classifies provider HTTP %s', async (status, code, retryable) => {
    const request = vi.fn().mockResolvedValue(new Response('', { status: Number(status) }));
    await expect(
      new OpenAiProvider('test', 'test', request).analyze(input, signal()),
    ).rejects.toMatchObject({ code, retryable });
  });
  it('classifies network failure as retryable', async () => {
    await expect(
      new OpenAiProvider('test', 'test', vi.fn().mockRejectedValue(new Error('network'))).analyze(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
  });
  it.each([
    'not-json',
    JSON.stringify({ status: 'incomplete' }),
    JSON.stringify({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: 'bad-json' }] }],
    }),
    'x'.repeat(150001),
  ])('rejects malformed, incomplete and oversized responses', async (body) => {
    await expect(
      new OpenAiProvider('test', 'test', vi.fn().mockResolvedValue(new Response(body))).analyze(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
  });
  it('preserves provider refusal', async () => {
    await expect(
      new OpenAiProvider(
        'test',
        'test',
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }),
            ),
          ),
      ).analyze(input, signal()),
    ).rejects.toMatchObject({ code: 'PROVIDER_REFUSAL', retryable: false });
  });
});
