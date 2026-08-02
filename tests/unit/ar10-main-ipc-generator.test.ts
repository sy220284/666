import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputRoot = path.join(process.cwd(), 'test-results/ar10-main-ipc-split');

describe('AR-10 Main IPC split candidate', () => {
  it('generates formatted domain registrars for isolated review', async () => {
    execFileSync(process.execPath, ['scripts/generate-ar10-main-ipc-split.mjs'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    const summaryText = await readFile(
      path.join(outputRoot, 'generation-summary.json'),
      'utf8',
    );
    const summary = JSON.parse(summaryText) as {
      readonly files: readonly string[];
      readonly groups: Readonly<Record<string, number>>;
    };
    expect(summary.files).toHaveLength(10);
    for (const file of summary.files) {
      expect((await stat(path.join(outputRoot, file))).size).toBeGreaterThan(0);
    }

    console.log('===AR10_SUMMARY===');
    console.log(summaryText);
    for (const file of summary.files) {
      console.log(`===AR10_FILE_BEGIN:${file}===`);
      console.log(await readFile(path.join(outputRoot, file), 'utf8'));
      console.log(`===AR10_FILE_END:${file}===`);
    }

    throw new Error('AR10_GENERATED_OUTPUT_READY');
  });
});
