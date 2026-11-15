import { Worker } from 'node:worker_threads';
import { BadRequestException } from '@nestjs/common';
// The script is constant; candidate bytes never become executable source.
const script = `
const {parentPort,workerData}=require('node:worker_threads');
const {PDFDocument,PDFDict,PDFName}=require(workerData.module);
(async()=>{
 const doc=await PDFDocument.load(new Uint8Array(workerData.bytes),{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
 if(doc.getPageCount()<1||doc.getPageCount()>100)throw new Error('Page limit');
 for(const [,object]of doc.context.enumerateIndirectObjects()){
   if(object instanceof PDFDict){
     for(const key of ['JS','JavaScript','EmbeddedFiles','XFA','OpenAction','AA'])if(object.has(PDFName.of(key)))throw new Error('Active content');
     const action=object.get(PDFName.of('S'));
     if(action&&['/JavaScript','/Launch','/RichMediaExecute'].includes(action.toString()))throw new Error('Active action');
   }
 }
 parentPort.postMessage(true);
})().catch(()=>parentPort.postMessage(false));`;
let active = 0;
export async function validateUploadedPdf(bytes: Buffer): Promise<void> {
  if (
    bytes.length > 5 * 1024 * 1024 ||
    bytes.subarray(0, 5).toString() !== '%PDF-' ||
    !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
  )
    throw new BadRequestException('Upload a complete PDF resume (maximum 5 MB).');
  if (active >= 2) throw new BadRequestException('PDF validation is busy. Try again.');
  active++;
  try {
    const valid = await new Promise<boolean>((resolve) => {
      const worker = new Worker(script, {
        eval: true,
        workerData: { module: require.resolve('pdf-lib'), bytes },
        resourceLimits: { maxOldGenerationSizeMb: 96 },
      });
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), 5000);
      worker.once('message', (message) => finish(message === true));
      worker.once('error', () => finish(false));
      worker.once('exit', () => finish(false));
    });
    if (!valid)
      throw new BadRequestException(
        'PDF could not be validated. Use an unencrypted PDF with 1–100 pages and no active content or attachments.',
      );
  } finally {
    active--;
  }
}
