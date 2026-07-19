import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = 'docs/test-evidence/M3-03';

async function filesUnder(current, prefix = '') {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await filesUnder(path.join(current, entry.name), relative)));
    else if (entry.isFile() && relative !== 'manifest.json') files.push(relative);
  }
  return files;
}

await writeFile(path.join(directory, 'screenshots/manifest.json'), '[]\n', 'utf8');
const files = [];
for (const relative of (await filesUnder(directory)).sort()) {
  const content = await readFile(path.join(directory, relative));
  files.push({
    path: relative,
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
await writeFile(
  path.join(directory, 'manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      taskId: 'M3-03',
      commit: 'working-tree',
      generatedAt: new Date().toISOString(),
      files,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(`M3-03 evidence manifest generated for ${files.length} files.`);
