import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEGACY_RENDERER_OWNERSHIP } from '../../apps/desktop/renderer/src/compat/legacy-ownership.js';

const rendererSource = path.join(process.cwd(), 'apps/desktop/renderer/src');
const legacyDirectAccessAllowlist = new Set([
  'global.d.ts',
  ...LEGACY_RENDERER_OWNERSHIP.map((record) => record.module),
]);

async function rendererSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await rendererSourceFiles(target)));
    else if (/\.tsx?$/u.test(entry.name)) files.push(target);
  }
  return files;
}

describe('M3-07 renderer bridge boundary', () => {
  it('keeps new Renderer code from reading window.worldforge outside bridge adapters', async () => {
    const violations: string[] = [];
    for (const file of await rendererSourceFiles(rendererSource)) {
      const relative = path.relative(rendererSource, file).replaceAll('\\', '/');
      if (relative.startsWith('bridge/') || legacyDirectAccessAllowlist.has(relative)) continue;
      const source = await readFile(file, 'utf8');
      if (/\bwindow\s*\.\s*worldforge\b/u.test(source)) violations.push(relative);
    }
    expect(violations).toEqual([]);
  });
});
