import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'apps/desktop/renderer/src/runtime/capability-matrix.ts',
  'apps/desktop/renderer/src/styles/base.css',
  'apps/desktop/renderer/src/styles/layout.css',
  'apps/desktop/renderer/src/styles/components/01-shell.css',
  'apps/desktop/renderer/src/styles/components/02-workspace.css',
  'apps/desktop/renderer/src/styles/components/03-dialogs.css',
  'apps/desktop/renderer/src/styles/components/04-features.css',
  'apps/desktop/renderer/src/styles/components/05-writing.css',
  'apps/desktop/renderer/src/styles/components/06-review.css',
  'apps/desktop/renderer/src/styles/themes.css',
  'tests/unit/renderer-react-runtime-root.test.ts',
] as const;

describe('AR-14 Prettier probe', () => {
  it('exports repository-formatted AR-14 files', async () => {
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const config = (await resolveConfig(file)) ?? {};
      const formatted = await format(source, { ...config, filepath: file });
      const target = path.join('test-results/unit/ar14-prettier', file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, formatted, 'utf8');
    }
    expect(files).toHaveLength(11);
    throw new Error('AR14_PRETTIER_READY');
  });
});
