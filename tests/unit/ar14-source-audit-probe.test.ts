import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const rendererRoot = 'apps/desktop/renderer/src';
const outputRoot = 'test-results/unit/ar14-source-audit';
const keyFiles = [
  'apps/desktop/renderer/src/react-entry.tsx',
  'apps/desktop/renderer/src/app/renderer-foundation-app.tsx',
  'apps/desktop/renderer/src/app/app-shell.tsx',
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  'apps/desktop/renderer/src/app/use-app-settings-persistence.ts',
  'apps/desktop/renderer/src/compat/legacy-surface.ts',
  'docs/architecture/source-structure-baseline.json',
];

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

describe('AR-14 source audit probe', () => {
  it('exports renderer CSS, controller sources and structural measurements', async () => {
    const rendererFiles = await walk(rendererRoot);
    const cssFiles = rendererFiles.filter((file) => file.endsWith('.css'));
    const sources = [...new Set([...cssFiles, ...keyFiles])];
    const measurements: Record<string, { lines: number; bytes: number }> = {};
    for (const file of sources) {
      const source = await readFile(file, 'utf8');
      measurements[file] = {
        lines: source.length === 0 ? 0 : source.split(/\r?\n/u).length,
        bytes: Buffer.byteLength(source),
      };
      const destination = path.join(outputRoot, 'files', file);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, source, 'utf8');
    }
    const baseline = JSON.parse(
      await readFile('docs/architecture/source-structure-baseline.json', 'utf8'),
    ) as { oversizedFiles: Record<string, unknown> };
    for (const file of Object.keys(baseline.oversizedFiles)) {
      const source = await readFile(file, 'utf8');
      measurements[file] = {
        lines: source.length === 0 ? 0 : source.split(/\r?\n/u).length,
        bytes: Buffer.byteLength(source),
      };
    }
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      path.join(outputRoot, 'manifest.json'),
      JSON.stringify({ cssFiles, measurements }, null, 2),
      'utf8',
    );
    expect(cssFiles.length).toBeGreaterThan(0);
    throw new Error('AR14_SOURCE_AUDIT_READY');
  });
});
