import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputRoot = path.join(process.cwd(), 'test-results/ar11-service-split');

describe('AR-11 service split candidate', () => {
  it('exports generated modules and complete TypeScript diagnostics for review', async () => {
    spawnSync(process.execPath, ['scripts/generate-ar11-service-split.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    const summaryText = await readFile(path.join(outputRoot, 'summary.json'), 'utf8');
    const diagnostics = await readFile(path.join(outputRoot, 'diagnostics.txt'), 'utf8');
    const summary = JSON.parse(summaryText) as {
      readonly files: readonly string[];
      readonly diagnosticCount: number;
    };
    expect(summary.files).toHaveLength(12);
    for (const file of summary.files) {
      expect((await stat(path.join(outputRoot, file))).size).toBeGreaterThan(0);
    }
    console.log('===AR11_SPLIT_SUMMARY===');
    console.log(summaryText);
    console.log('===AR11_DIAGNOSTICS_BEGIN===');
    console.log(diagnostics);
    console.log('===AR11_DIAGNOSTICS_END===');
    for (const file of summary.files) {
      console.log(`===AR11_FILE_BEGIN:${file}===`);
      console.log(await readFile(path.join(outputRoot, file), 'utf8'));
      console.log(`===AR11_FILE_END:${file}===`);
    }
    throw new Error('AR11_SPLIT_OUTPUT_READY');
  });
});
