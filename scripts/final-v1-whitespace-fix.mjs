import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_MAIN = '0363eb94da694aa359076cec79064cc41b42d6e1';
const GENERATED_AT = '2026-07-29T00:55:00.000Z';
const textFiles = [
  'docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md',
  'docs/tasks/M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md',
  'docs/test-evidence/M4-04/summary.md',
  'docs/test-evidence/M8-02/summary.md',
];

for (const file of textFiles) {
  const source = await readFile(file, 'utf8');
  await writeFile(file, source.replace(/[ \t]+$/gmu, ''), 'utf8');
}

async function rebuild(taskId, extras = {}) {
  const directory = path.join('docs/test-evidence', taskId);
  const names = (await readdir(directory)).filter((name) => name !== 'manifest.json').sort();
  const files = [];
  for (const name of names) {
    const absolute = path.join(directory, name);
    const metadata = await stat(absolute);
    if (!metadata.isFile()) throw new Error(`${absolute} must be a regular file`);
    const content = await readFile(absolute);
    files.push({
      path: name,
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId,
        commit: PRODUCT_MAIN,
        generatedAt: GENERATED_AT,
        ...extras,
        files,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

await rebuild('M4-04');
await rebuild('M8-02', {
  distributionScope: 'SELF_USE_PORTABLE',
  acceptanceSource: 'GITHUB_ACTIONS_ONLY',
});

console.log('Final V1 closure whitespace and evidence hashes normalized.');
