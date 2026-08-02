import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputRoot = path.join(process.cwd(), 'test-results/ar11-service-split');

describe('AR-11 service split candidate', () => {
  it('exports 12 generated modules with zero TypeScript diagnostics', async () => {
    const generation = spawnSync(
      process.execPath,
      ['scripts/run-ar11-service-split-fixed.mjs'],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
      },
    );
    expect(generation.status).toBe(0);

    const typecheck = spawnSync(process.execPath, ['scripts/typecheck-ar11-service-split.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    expect(typecheck.status).toBe(0);

    const summaryText = await readFile(path.join(outputRoot, 'summary.json'), 'utf8');
    const diagnostics = await readFile(path.join(outputRoot, 'diagnostics.txt'), 'utf8');
    const summary = JSON.parse(summaryText) as {
      readonly files: readonly string[];
      readonly diagnosticCount: number;
    };

    expect(summary.files).toHaveLength(12);
    expect(summary.diagnosticCount).toBe(0);
    expect(diagnostics.trim()).toBe('');
    for (const file of summary.files) {
      expect((await stat(path.join(outputRoot, file))).size).toBeGreaterThan(0);
    }
  });
});
