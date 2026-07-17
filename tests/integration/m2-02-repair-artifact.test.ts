import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const formatFiles = [
  'packages/contracts/src/candidate.ts',
  'packages/contracts/src/version.ts',
  'packages/core-service/src/candidate.ts',
  'packages/core-service/src/index.ts',
  'packages/core-service/src/version.ts',
  'tests/integration/candidate-version-model.test.ts',
  'tests/integration/m2-02-repair-artifact.test.ts',
  'tests/migration/project-structure-migration.test.ts',
  'tests/migration/recovery-migration.test.ts',
  'tests/migration/sqlite-foundation.test.ts',
  'tests/migration/testkit-faults.test.ts',
] as const;

const repositoryFormat = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

async function emit(file: string, source: string): Promise<void> {
  const formatted = await prettier.format(source, { filepath: file, ...repositoryFormat });
  const output = path.join('test-results/integration/m2-02-repair', file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, formatted, 'utf8');
}

describe('M2-02 repair artifact', () => {
  it('emits repository-formatted changed files and schema-v7 security expectations', async () => {
    for (const file of formatFiles) {
      await emit(file, await readFile(file, 'utf8'));
    }

    const securityFile = 'tests/security/project-workspace.test.ts';
    const securitySource = (await readFile(securityFile, 'utf8'))
      .replace('projectSchemaVersion: 6,', 'projectSchemaVersion: 7,')
      .replace('schema_version: 6,', 'schema_version: 7,');
    await emit(securityFile, securitySource);

    expect(securitySource).toContain('projectSchemaVersion: 7');
    expect(securitySource).toContain('schema_version: 7');
  });
});
