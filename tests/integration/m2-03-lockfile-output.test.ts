import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const prettier = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

function replaceExact(source: string, before: string, after: string, expected: number, path: string) {
  const matches = source.split(before).length - 1;
  expect(matches, `${path}: ${before}`).toBe(expected);
  return source.replaceAll(before, after);
}

async function emit(path: string, transform: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8');
  const transformed = transform(source);
  const output = path.endsWith('.ts')
    ? await format(transformed, { ...prettier, filepath: path })
    : transformed;
  console.log(`M203_FILE:${path}:${Buffer.from(output, 'utf8').toString('base64')}`);
}

describe('M2-03 delivery baseline outputs', () => {
  it('emits the complete lockfile with the declared editor-core dependency', async () => {
    await emit('pnpm-lock.yaml', (source) =>
      replaceExact(
        source,
        `      '@worldforge/domain':\n        specifier: workspace:*\n        version: link:../domain\n      iconv-lite:`,
        `      '@worldforge/domain':\n        specifier: workspace:*\n        version: link:../domain\n      '@worldforge/editor-core':\n        specifier: workspace:*\n        version: link:../editor-core\n      iconv-lite:`,
        1,
        'pnpm-lock.yaml',
      ),
    );
  });

  it('emits v8 migration and security baselines', async () => {
    await emit('tests/migration/project-structure-migration.test.ts', (source) => {
      let output = replaceExact(
        source,
        "{ schemaVersion: 7, compatibility: 'migrated' }",
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        2,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'project-v1-to-v7-',
        'project-v1-to-v8-',
        1,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'version: 7n,',
        'version: 8n,',
        1,
        'tests/migration/project-structure-migration.test.ts',
      );
      output = replaceExact(
        output,
        'schema_version: 7n',
        'schema_version: 8n',
        2,
        'tests/migration/project-structure-migration.test.ts',
      );
      return replaceExact(
        output,
        'projectSchemaVersion: 7,',
        'projectSchemaVersion: 8,',
        1,
        'tests/migration/project-structure-migration.test.ts',
      );
    });

    await emit('tests/migration/recovery-migration.test.ts', (source) =>
      replaceExact(
        source,
        "{ schemaVersion: 7, compatibility: 'migrated' }",
        "{ schemaVersion: 8, compatibility: 'migrated' }",
        1,
        'tests/migration/recovery-migration.test.ts',
      ),
    );

    await emit('tests/migration/sqlite-foundation.test.ts', (source) => {
      let output = replaceExact(
        source,
        "      'backup_records',\n      'candidate_blocks',",
        "      'backup_records',\n      'candidate_apply_checkpoints',\n      'candidate_apply_records',\n      'candidate_block_sources',\n      'candidate_blocks',\n      'candidate_conflict_sets',",
        1,
        'tests/migration/sqlite-foundation.test.ts',
      );
      return replaceExact(
        output,
        ').toBe(7n);',
        ').toBe(8n);',
        1,
        'tests/migration/sqlite-foundation.test.ts',
      );
    });

    await emit('tests/migration/testkit-faults.test.ts', (source) =>
      replaceExact(
        source,
        'workspace.projectDatabase.schemaVersion).toBe(7);',
        'workspace.projectDatabase.schemaVersion).toBe(8);',
        1,
        'tests/migration/testkit-faults.test.ts',
      ),
    );

    await emit('tests/security/project-workspace.test.ts', (source) => {
      let output = replaceExact(
        source,
        'projectSchemaVersion: 7,',
        'projectSchemaVersion: 8,',
        1,
        'tests/security/project-workspace.test.ts',
      );
      return replaceExact(
        output,
        'schema_version: 7,',
        'schema_version: 8,',
        1,
        'tests/security/project-workspace.test.ts',
      );
    });
  });
});
