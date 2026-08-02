import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, it } from 'vitest';

const targets = [
  'packages/core-service/src/validation/validation-comment-operations.ts',
  'packages/core-service/src/validation/validation-issue-operations.ts',
  'packages/core-service/src/validation/validation-model.ts',
  'packages/core-service/src/validation/validation-rule-operations.ts',
  'packages/core-service/src/validation/validation-todo-operations.ts',
] as const;

describe('AR-13 Validation format probe', () => {
  it('exports repository formatter results', async () => {
    for (const target of targets) {
      const config = await resolveConfig(target);
      const formatted = await format(await readFile(target, 'utf8'), {
        ...(config ?? {}),
        filepath: target,
      });
      const destination = path.join('test-results', 'unit', 'ar13-format-probe', target);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, formatted, 'utf8');
    }
    throw new Error('AR13_VALIDATION_FORMAT_PROBE_READY');
  });
});
