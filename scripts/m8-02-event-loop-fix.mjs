import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'tests/performance/m8-release-evidence.test.ts';
const before = await readFile(filePath, 'utf8');
const needle = `        if (index % 20 === 0) await new Promise((resolve) => setImmediate(resolve));`;
const replacement = `        await new Promise((resolve) => setImmediate(resolve));`;
const first = before.indexOf(needle);
if (first < 0) throw new Error('MISSING:event-loop-yield-batch');
if (before.indexOf(needle, first + needle.length) >= 0) throw new Error('MULTIPLE:event-loop-yield-batch');
await writeFile(
  filePath,
  before.slice(0, first) + replacement + before.slice(first + needle.length),
  'utf8',
);
console.log('M8-02 sustained workload now yields after every simulated IPC transaction.');
