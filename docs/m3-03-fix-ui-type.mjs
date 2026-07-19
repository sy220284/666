import { readFile, writeFile } from 'node:fs/promises';

const path = 'apps/desktop/renderer/src/canon-ui.ts';
const source = await readFile(path, 'utf8');
const before = '    let value: unknown;\n';
const after = "    let value: Entity['facts'][number]['value'];\n";
if (!source.includes(before)) throw new Error('Missing Canon JSON value type anchor.');
await writeFile(path, source.replace(before, after), 'utf8');
console.log('M3-03 Canon JSON value type fixed.');
