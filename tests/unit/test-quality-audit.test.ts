import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditTests } from '../../scripts/test-quality-audit.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(
  files: Record<string, string>,
  unsafeTypeEscapes: Record<string, number> = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-test-quality-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'tests', 'unit'), { recursive: true });
  await writeFile(
    path.join(root, 'tests', 'test-quality-baseline.json'),
    JSON.stringify({ schemaVersion: 1, unsafeTypeEscapes }),
    'utf8',
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return root;
}

describe('test quality audit', () => {
  it('accepts behavior-focused tests with an exact unsafe-cast baseline', async () => {
    const root = await fixture(
      {
        'tests/unit/example.test.ts': `
          import { expect, it } from 'vitest';
          it('checks the result', () => {
            const value = ({ ok: true } as never) as { ok: boolean };
            expect(value).toEqual({ ok: true });
          });
        `,
      },
      { 'tests/unit/example.test.ts': 1 },
    );

    const result = await auditTests({ repositoryRoot: root });
    expect(result.violations).toEqual([]);
    expect(result.metrics).toMatchObject({ files: 1, assertions: 1 });
  });

  it('reports focused tests, vacuous assertions, pass-through schemas and weak surface counts', async () => {
    const root = await fixture({
      'tests/unit/invalid.test.ts': `
        import { expect, it } from 'vitest';
        const ContractSchema = { parse: (input: unknown) => input };
        it.only('does not validate behavior', () => {
          const handlers = new Map();
          expect(true).toBe(true);
          expect(handlers.size).toBeGreaterThan(2);
          void ContractSchema;
        });
      `,
    });

    const result = await auditTests({ repositoryRoot: root });
    expect(result.violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining([
        'focused-or-skipped-test',
        'vacuous-boolean-assertion',
        'pass-through-schema-mock',
        'weak-handler-count-assertion',
      ]),
    );
  });

  it('requires the unsafe type escape baseline to match the entire suite exactly', async () => {
    const root = await fixture({
      'tests/unit/cast.test.ts': `
        import { expect, it } from 'vitest';
        it('uses one boundary cast', () => {
          const value = {} as never;
          expect(value).toBeDefined();
        });
      `,
    });

    const result = await auditTests({ repositoryRoot: root });
    expect(result.violations).toEqual([
      expect.objectContaining({
        file: 'tests/test-quality-baseline.json',
        rule: 'unsafe-type-escape-baseline-mismatch',
      }),
    ]);
    expect(result.unsafeTypeEscapes).toEqual({ 'tests/unit/cast.test.ts': 1 });
  });

  it('keeps every committed test file within the repository quality policy', async () => {
    const result = await auditTests();
    expect(result.violations).toEqual([]);
  });
});
