import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const file = new URL('../.env', import.meta.url);
let text = readFileSync(file, 'utf8');
for (const [key, length] of [
  ['SESSION_SECRET', 32],
  ['OWNER_PASSWORD', 18],
]) {
  const pattern = new RegExp(`^${key}=([^\\r\\n]*)`, 'm');
  const current = text.match(pattern);
  if (!current) text += `\n${key}=${randomBytes(length).toString('hex')}\n`;
  else if (current[1].startsWith('replace_with_'))
    text = text.replace(pattern, `${key}=${randomBytes(length).toString('hex')}`);
}
writeFileSync(file, text);
console.log('Application credentials configured in private .env; existing values preserved.');
