import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ProfileContent, ResumeContent } from './resume.domain';

const headings = {
  summary: 'Summary',
  skill: 'Skills',
  experience: 'Experience',
  achievement: 'Achievements',
  education: 'Education',
};
const fonts = resolve(__dirname, '../assets/fonts');
export async function renderResume(
  profile: ProfileContent,
  content: ResumeContent,
): Promise<Buffer> {
  return new Promise((resolveResult, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      compress: true,
      info: { Title: `${profile.name} - Resume`, Author: profile.name, Creator: 'Job Search OS' },
    });
    const chunks: Buffer[] = [];
    let bytes = 0,
      pages = 1,
      settled = false;
    const timeout = setTimeout(
      () => fail(new ServiceUnavailableException('PDF export timed out. Please retry.')),
      8000,
    );
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      doc.destroy();
      reject(error);
    }
    doc.on('error', fail);
    doc.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2.5 * 1024 * 1024)
        fail(new BadRequestException('PDF exceeds the 2.5 MB export limit.'));
      else chunks.push(chunk);
    });
    doc.on('pageAdded', () => {
      pages++;
      if (pages > 20) throw new BadRequestException('Resume exceeds the 20-page export limit.');
    });
    doc.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult(Buffer.concat(chunks));
    });
    try {
      doc.registerFont('Regular', resolve(fonts, 'NotoSans-Regular.ttf'));
      doc.registerFont('Bold', resolve(fonts, 'NotoSans-Bold.ttf'));
      const width = doc.page.width - 100;
      function ensure(height: number) {
        if (doc.y + height > doc.page.height - 50) doc.addPage();
      }
      function text(value: string, size = 10.5, bold = false) {
        doc
          .font(bold ? 'Bold' : 'Regular')
          .fontSize(size)
          .fillColor('#172923')
          .text(value, { width, lineGap: 3 });
      }
      text(profile.name, 22, true);
      if (content.headline) {
        doc.moveDown(0.25);
        text(content.headline, 12);
      }
      const contacts = [profile.email, profile.phone, profile.location, profile.website].filter(
        Boolean,
      );
      if (contacts.length) {
        doc.moveDown(0.45);
        text(contacts.join(' | '), 9.5);
      }
      doc.moveDown(0.8);
      content.blocks.forEach((block, index) => {
        const section = index === 0 || content.blocks[index - 1].kind !== block.kind;
        const titleHeight = doc.font('Bold').fontSize(11).heightOfString(block.title, { width });
        const contextHeight = block.context
          ? doc.font('Regular').fontSize(9.5).heightOfString(block.context, { width })
          : 0;
        const fullHeight =
          titleHeight +
          contextHeight +
          doc.font('Regular').fontSize(10.5).heightOfString(block.text, { width, lineGap: 3 }) +
          16 +
          (section ? 32 : 0);
        ensure(fullHeight < doc.page.height - 100 ? fullHeight : titleHeight + contextHeight + 70);
        if (section) {
          doc.moveDown(0.6);
          text(headings[block.kind], 12, true);
          doc.moveDown(0.3);
        }
        text(block.title, 11, true);
        if (block.context) text(block.context, 9.5);
        doc.moveDown(0.25);
        // Sequential single-column text is the PDF reading order. No text boxes, graphics or remote assets.
        text(block.text.replace(/\u2011/g, '-'));
        doc.moveDown(0.65);
      });
      doc.end();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('PDF rendering failed.'));
    }
  });
}
