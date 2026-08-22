import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const auditedRoots = ['apps', 'packages', 'scripts', '.github'];
const auditedExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(directory.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relative)));
      continue;
    }
    if (entry.isFile() && auditedExtensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

describe('M10-02 full-code audit baseline', () => {
  it('contains no unresolved merge conflict markers in production and governance sources', async () => {
    const files = (await Promise.all(auditedRoots.map(collectFiles))).flat();
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(root, file), 'utf8');
      if (/^(?:<{7}|={7}|>{7})(?:\s|$)/mu.test(source)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it('keeps the repaired pnpm version consistent across the repository', async () => {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      packageManager?: string;
    };
    expect(packageJson.packageManager).toBe('pnpm@11.21.0');

    const workflowFiles = await collectFiles('.github');
    const stalePins: string[] = [];
    for (const file of workflowFiles) {
      const source = await readFile(path.join(root, file), 'utf8');
      if (source.includes('11.13.0')) stalePins.push(file);
    }
    expect(stalePins).toEqual([]);
  });

  it('keeps interval polling limited to implementations with explicit single-flight guards', async () => {
    const rendererFiles = await collectFiles('apps/desktop/renderer/src');
    const intervalUsers: string[] = [];
    for (const file of rendererFiles) {
      const source = await readFile(path.join(root, file), 'utf8');
      if (source.includes('setInterval(')) intervalUsers.push(file);
    }
    expect(intervalUsers.sort()).toEqual([
      'apps/desktop/renderer/src/runtime/core-recovery-supervisor.ts',
    ]);
    const generationPolling = await readFile(
      path.join(root, 'apps/desktop/renderer/src/features/writing/generation-task-subscription.ts'),
      'utf8',
    );
    expect(generationPolling).toContain('startSingleFlightPolling');
    expect(generationPolling).toContain('15_000');
    expect(generationPolling).not.toContain('setInterval(');
  });
});
