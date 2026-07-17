import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const prettier = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

function replaceExact(
  source: string,
  before: string,
  after: string,
  expected: number,
  path: string,
) {
  const matches = source.split(before).length - 1;
  expect(matches, `${path}: ${before}`).toBe(expected);
  return source.replaceAll(before, after);
}

async function assertBaseline(path: string, transform: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8');
  const transformed = transform(source);
  const output = path.endsWith('.ts')
    ? await format(transformed, { ...prettier, filepath: path })
    : transformed;
  expect(output).toBe(source);
}

describe('M2-03 delivery baselines', () => {
  it('keeps core-service independent from editor-core', async () => {
    const packageJson = await readFile('packages/core-service/package.json', 'utf8');
    const tsconfig = await readFile('packages/core-service/tsconfig.json', 'utf8');
    expect(packageJson).not.toContain('@worldforge/editor-core');
    expect(tsconfig).not.toContain('../editor-core');
  });

  it('keeps v8 migration and security baselines current', async () => {
    await assertBaseline('tests/migration/project-structure-migration.test.ts', (source) => {
      let output = replaceExact(
        source,
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        2,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'project-v1-to-v8-',
        'project-v1-to-v8-',
        1,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'version: 8n,',
        'version: 8n,',
        2,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'schema_version: 8n',
        'schema_version: 8n',
        2,
        'tests/migration/project-structure-migration.test.ts',
      );
      return replaceExact(
        output,
        'projectSchemaVersion: 8,',
        'projectSchemaVersion: 8,',
        1,
        'tests/migration/project-structure-migration.test.ts',
      );
    });

    await assertBaseline('tests/migration/recovery-migration.test.ts', (source) =>
      replaceExact(
        source,
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        1,
        'tests/migration/recovery-migration.test.ts',
      ),
    );

    await assertBaseline('tests/migration/sqlite-foundation.test.ts', (source) => {
      let output = replaceExact(
        source,
        "      'backup_records',\n      'candidate_apply_checkpoints',\n      'candidate_apply_records',\n      'candidate_block_sources',\n      'candidate_blocks',\n      'candidate_conflict_sets',",
        "      'backup_records',\n      'candidate_apply_checkpoints',\n      'candidate_apply_records',\n      'candidate_block_sources',\n      'candidate_blocks',\n      'candidate_conflict_sets',",
        1,
        'tests/migration/sqlite-foundation.test.ts',
      );
      return replaceExact(
        output,
        ').toBe(8n);',
        ').toBe(8n);',
        1,
        'tests/migration/sqlite-foundation.test.ts',
      );
    });

    await assertBaseline('tests/migration/testkit-faults.test.ts', (source) =>
      replaceExact(
        source,
        'workspace.projectDatabase.schemaVersion).toBe(8);',
        'workspace.projectDatabase.schemaVersion).toBe(8);',
        1,
        'tests/migration/testkit-faults.test.ts',
      ),
    );

    await assertBaseline('tests/security/project-workspace.test.ts', (source) => {
      let output = replaceExact(
        source,
        'projectSchemaVersion: 8,',
        'projectSchemaVersion: 8,',
        1,
        'tests/security/project-workspace.test.ts',
      );
      return replaceExact(
        output,
        'schema_version: 8,',
        'schema_version: 8,',
        1,
        'tests/security/project-workspace.test.ts',
      );
    });
  });
});
