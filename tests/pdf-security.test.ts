import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { validateUploadedPdf } from '../apps/api/src/pdf-validation';
async function document() {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc;
}
describe('PDF upload structural boundary', () => {
  it('accepts a real PDF without active content', async () => {
    const doc = await document();
    await expect(validateUploadedPdf(Buffer.from(await doc.save()))).resolves.toBeUndefined();
  });
  it.each([
    Buffer.from('not a PDF'),
    Buffer.from('%PDF-1.4\n%%EOF'),
    Buffer.from('%PDF-1.7\ntruncated'),
    Buffer.alloc(5 * 1024 * 1024 + 1),
  ])(
    'rejects incomplete, fake or oversized files',
    async (bytes) => await expect(validateUploadedPdf(bytes)).rejects.toThrow(),
  );
  it('rejects automatic JavaScript actions', async () => {
    const doc = await document();
    doc.catalog.set(
      PDFName.of('OpenAction'),
      doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('app.alert("fixture")') }),
    );
    await expect(validateUploadedPdf(Buffer.from(await doc.save()))).rejects.toThrow(
      'no active content',
    );
  });
  it('rejects excessive page counts', async () => {
    const doc = await document();
    for (let i = 0; i < 100; i++) doc.addPage();
    await expect(validateUploadedPdf(Buffer.from(await doc.save()))).rejects.toThrow('1–100 pages');
  });
});
