import { readFile } from 'node:fs/promises';

const guarded = [
  'apps/desktop/renderer/src/app/App.tsx',
  'apps/desktop/renderer/src/state/ui-store.ts',
  'apps/desktop/renderer/src/foundation/status-arbiter.ts',
  'apps/desktop/renderer/src/foundation/legacy-surface.ts',
];
const failures = [];
for (const file of guarded) {
  const source = await readFile(file, 'utf8');
  for (const forbidden of [
    'window.worldforge',
    'document.querySelector',
    '.innerHTML',
    'localStorage',
    'persist(',
  ]) {
    if (source.includes(forbidden)) failures.push(`${file}: forbidden ${forbidden}`);
  }
}
const bridge = await readFile('apps/desktop/renderer/src/bridge/adapter.ts', 'utf8');
if ((bridge.match(/window\.worldforge/gu) ?? []).length !== 1) {
  failures.push('bridge/adapter.ts must own exactly one preload global access');
}
if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Renderer React boundaries passed.\n');
}
