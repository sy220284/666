import { readFile, writeFile } from 'node:fs/promises';

const path = 'packages/core-service/src/entity-canon.ts';
let source = await readFile(path, 'utf8');
for (const method of ['create', 'update', 'archive', 'setFact', 'linkSceneBeat', 'delete']) {
  const before = `\n  ${method}(requestId: string,`;
  const after = `\n  async ${method}(requestId: string,`;
  if (source.includes(after)) continue;
  if (!source.includes(before)) throw new Error(`Missing EntityCanonService method: ${method}`);
  source = source.replace(before, after);
}
await writeFile(path, source, 'utf8');
console.log('M3-03 async command boundary applied.');
