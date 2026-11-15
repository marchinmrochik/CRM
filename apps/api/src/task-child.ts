import { renderResume } from './resume.pdf';
import { profileSchema, contentSchema } from './resume.domain';
import {
  analysisInputSchema,
  aiStatus,
  OpenAiProvider,
  OperationError,
  validateAnalysis,
} from './ai.provider';
import { settings } from './config';

process.once('message', async (message: { kind: string; input: unknown }) => {
  try {
    if (message.kind === 'pdf_publish') {
      const input = message.input as { profile: unknown; content: unknown };
      const bytes = await renderResume(
        profileSchema.parse(input.profile),
        contentSchema.parse(input.content),
      );
      process.send?.({ ok: true, pdf: bytes.toString('base64') });
    } else {
      if (aiStatus() !== 'configured')
        throw new OperationError('AI_DISABLED', 'AI is disabled or requires worker configuration.');
      const input = analysisInputSchema.parse(message.input);
      const provider = new OpenAiProvider(settings.OPENAI_API_KEY!, settings.OPENAI_MODEL);
      const result = validateAnalysis(
        await provider.analyze(input, AbortSignal.timeout(45000)),
        input,
      );
      process.send?.({ ok: true, analysis: result });
    }
  } catch (error) {
    const safe =
      error instanceof OperationError
        ? error
        : new OperationError('INVALID_INPUT', 'Document or analysis input failed validation.');
    process.send?.({ ok: false, code: safe.code, reason: safe.message, retryable: safe.retryable });
  } finally {
    process.disconnect?.();
  }
});
