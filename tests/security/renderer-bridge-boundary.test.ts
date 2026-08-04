import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererSource = path.join(process.cwd(), 'apps/desktop/renderer/src');
const retiredCompatibilityFiles = [
  'compat/legacy-loader.ts',
  'compat/legacy-ownership.ts',
] as const;
const directAccessAllowlist = new Set(['global.d.ts']);

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

describe('Renderer bridge boundary', () => {
  it('keeps Renderer code from reading window.worldforge outside bridge adapters', async () => {
    const violations: string[] = [];
    for (const file of await rendererSourceFiles(rendererSource)) {
      const relative = path.relative(rendererSource, file).replaceAll('\\', '/');
      if (relative.startsWith('bridge/') || directAccessAllowlist.has(relative)) continue;
      const source = await readFile(file, 'utf8');
      if (/\bwindow\s*\.\s*worldforge\b/u.test(source)) violations.push(relative);
    }
    expect(violations).toEqual([]);
  });

  it('keeps the retired compatibility files absent', async () => {
    for (const relative of retiredCompatibilityFiles) {
      await expect(access(path.join(rendererSource, relative))).rejects.toThrow();
    }
  });
});
