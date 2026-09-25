/** Sort affiliates.txt by domain and drop duplicate domains (the first line wins). Comments at the top stay put. */
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../affiliates.txt', import.meta.url);
const lines = readFileSync(file, 'utf8').split('\n');
const head = [];
let i = 0;
for (; i < lines.length && (lines[i].startsWith('#') || !lines[i].trim()); i++) head.push(lines[i]);
const seen = new Map();
for (const raw of lines.slice(i)) {
  const line = raw.trim().replace(/\s+/g, ' ');
  if (!line || line.startsWith('#')) continue;
  const domain = line
    .split(' ')[0]
    .toLowerCase()
    .replace(/^www\./, '');
  if (seen.has(domain)) console.warn(`dropped duplicate: ${line}`);
  else seen.set(domain, [domain, ...line.split(' ').slice(1)].join(' '));
}
const body = [...seen.keys()].sort().map((d) => seen.get(d));
while (head.length && !head.at(-1).trim()) head.pop();
writeFileSync(file, `${[...head, '', ...body].join('\n')}\n`);
console.log(`affiliates.txt: ${body.length} providers`);
