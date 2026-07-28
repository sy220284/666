import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, replacements) {
  let source = await readFile(path, 'utf8');
  for (const [needle, replacement, label] of replacements) {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error(`MISSING:${label}`);
    if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`MULTIPLE:${label}`);
    source = source.slice(0, first) + replacement + source.slice(first + needle.length);
  }
  await writeFile(path, source, 'utf8');
}

await replaceExact('packages/core-service/src/recovery.ts', [
  [
    `    let lock: Awaited<ReturnType<typeof open>> | null = null;`,
    `    let lock: Awaited<ReturnType<typeof open>>;`,
    'daily-lock-uninitialized',
  ],
  [
    `    if (!lock) throw new RecoveryServiceError('BACKUP_CREATE_FAILED', 'Daily backup lock failed.');\n`,
    ``,
    'daily-lock-null-guard',
  ],
]);

await replaceExact('tests/performance/m8-release-evidence.test.ts', [
  [
    `    let heapGrowthBytes = 0;`,
    `    const memory = { heapGrowthBytes: 0 };`,
    'heap-growth-container',
  ],
  [
    `      heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);`,
    `      memory.heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);`,
    'heap-growth-assignment',
  ],
  [
    `    expect(heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);`,
    `    expect(memory.heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);`,
    'heap-growth-expectation',
  ],
]);

console.log('M8-02 generated static issues fixed.');
