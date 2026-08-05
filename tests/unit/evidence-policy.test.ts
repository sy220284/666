import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEvidenceHead,
  assertEvidenceSourceCommit,
  assertFinalEvidenceSemantics,
  assertReadyEvidenceClosure,
  changedRuntimeTasks,
  evidenceImplementationCommit,
  isAllowedFinalClosurePath,
  REQUIRED_EVIDENCE_FILES,
  validateChangedEvidenceAtHead,
  validateTaskEvidence,
} from '../../scripts/evidence-policy.mjs';

const temporaryDirectories: string[] = [];

function hash(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

async function commitAll(root: string, message: string): Promise<string> {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function gitFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-head-'));
  temporaryDirectories.push(root);
  git(root, 'init');
  git(root, 'config', 'user.email', 'ci@example.invalid');
  git(root, 'config', 'user.name', 'CI Fixture');
  await writeFile(path.join(root, 'source.txt'), 'source\n');
  const sourceCommit = await commitAll(root, 'source');
  await writeFile(path.join(root, 'implementation.txt'), 'implementation\n');
  const head = await commitAll(root, 'implementation');
  return { root, sourceCommit, head };
}

async function writeEvidencePackage(
  root: string,
  taskId: string,
  implementationCommit: string,
  summary = '# 验证摘要\n\n状态：已完成并通过。\n',
): Promise<void> {
  const directory = path.join(root, 'docs', 'test-evidence', taskId);
  const files = new Map<string, Buffer>([
    ['summary.md', Buffer.from(summary)],
    ['commands.txt', Buffer.from('pnpm test\nexit=0\n')],
    ['known-risks.md', Buffer.from('# 已知风险\n\n- 无。\n')],
  ]);
  for (const [relative, content] of files) {
    const absolute = path.join(directory, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const manifest = {
    schemaVersion: 2,
    taskId,
    implementationCommit,
    generatedAt: '2026-08-05T00:00:00.000Z',
    files: [...files].map(([relative, content]) => ({
      path: relative,
      bytes: content.byteLength,
      sha256: hash(content),
    })),
  };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readyClosureFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-ready-'));
  temporaryDirectories.push(root);
  git(root, 'init');
  git(root, 'config', 'user.email', 'ci@example.invalid');
  git(root, 'config', 'user.name', 'CI Fixture');
  await writeFile(path.join(root, 'source.txt'), 'source\n');
  const baseSha = await commitAll(root, 'source');

  const taskId = 'M10-09';
  const source = 'docs/tasks/M10/M10-09_EVIDENCE_CLOSURE_RACE.md';
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(
    path.join(root, 'scripts', 'evidence-policy.mjs'),
    'export const policy = true;\n',
  );
  await mkdir(path.dirname(path.join(root, source)), { recursive: true });
  await writeFile(path.join(root, source), '# M10-09\n\n状态：Implemented。\n');
  await mkdir(path.join(root, 'docs', 'tasks', 'runtime'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'tasks', 'runtime', `${taskId}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        id: taskId,
        status: 'IMPLEMENTED',
        source,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(root, 'docs', 'tasks', 'TASK_INDEX.md'),
    `| ${taskId} | Evidence收口 | M10-08 | Implemented |\n`,
  );
  const implementationCommit = await commitAll(root, 'implementation');
  await writeEvidencePackage(root, taskId, implementationCommit);
  const head = await commitAll(root, 'final evidence');
  return { root, taskId, source, baseSha, implementationCommit, head };
}

async function evidenceFixture(schemaVersion: 1 | 2 = 1) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-evidence-policy-'));
  temporaryDirectories.push(root);
  const taskId = 'M9-99';
  const directory = path.join(root, 'docs', 'test-evidence', taskId);
  const files = new Map<string, Buffer>();
  for (const relative of REQUIRED_EVIDENCE_FILES) {
    files.set(relative, Buffer.from(`${relative}\n`));
  }

  for (const [relative, content] of files) {
    const absolute = path.join(directory, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  const manifest = {
    schemaVersion,
    taskId,
    ...(schemaVersion === 1 ? { commit: 'abcdef1' } : { implementationCommit: 'abcdef1' }),
    generatedAt: '2026-07-18T00:00:00.000Z',
    files: [...files].map(([relative, content]) => ({
      path: relative,
      bytes: content.byteLength,
      sha256: hash(content),
    })),
  };
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, taskId, directory, manifest };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('evidence policy', () => {
  it('locks the mandatory package to three payload files plus manifest', () => {
    expect(REQUIRED_EVIDENCE_FILES).toEqual(['summary.md', 'commands.txt', 'known-risks.md']);
    expect(REQUIRED_EVIDENCE_FILES).not.toEqual(
      expect.arrayContaining(['screenshots', 'manual-acceptance.md', 'quality-matrix.md']),
    );
  });

  it('verifies documentation bytes, hashes and complete file registration', async () => {
    const legacy = await evidenceFixture(1);
    const current = await evidenceFixture(2);
    await expect(validateTaskEvidence(legacy.taskId, legacy.root)).resolves.toMatchObject({
      schemaVersion: 1,
    });
    await expect(validateTaskEvidence(current.taskId, current.root)).resolves.toMatchObject({
      schemaVersion: 2,
    });
    expect(evidenceImplementationCommit(legacy.manifest)).toBe('abcdef1');
    expect(evidenceImplementationCommit(current.manifest)).toBe('abcdef1');
  });

  it('returns cleanly when a Draft revision changes no Evidence package', async () => {
    const fixture = await gitFixture();
    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.sourceCommit,
        expectedHead: fixture.head,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects content changed after the manifest was generated', async () => {
    const fixture = await evidenceFixture();
    await writeFile(path.join(fixture.directory, 'summary.md'), 'changed after manifest\n');
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).rejects.toThrow(
      'evidence integrity mismatch: summary.md',
    );
  });

  it('rejects traversal and files omitted from the manifest', async () => {
    const fixture = await evidenceFixture();
    const manifestPath = path.join(fixture.directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as typeof fixture.manifest;
    manifest.files[0]!.path = '../escape.txt';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await expect(validateTaskEvidence(fixture.taskId, fixture.root)).rejects.toThrow(
      'unsafe evidence path',
    );

    const restored = await evidenceFixture();
    await writeFile(path.join(restored.directory, 'unlisted.txt'), 'not in manifest\n');
    await expect(validateTaskEvidence(restored.taskId, restored.root)).rejects.toThrow(
      'evidence contains unlisted files: unlisted.txt',
    );
  });

  it('binds the CI check to the exact PR Head and the manifest to an implementation ancestor', async () => {
    const fixture = await gitFixture();
    expect(assertEvidenceHead(fixture.head, fixture.root)).toBe(fixture.head);
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.sourceCommit, fixture.head, fixture.root),
    ).not.toThrow();
    expect(() => assertEvidenceHead('0'.repeat(40), fixture.root)).toThrow('checkout SHA mismatch');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', 'working-tree', fixture.head, fixture.root),
    ).toThrow('committed implementation revision');
    expect(() =>
      assertEvidenceSourceCommit('M9-99', fixture.head, fixture.sourceCommit, fixture.root),
    ).toThrow('not an ancestor');
  });
});

describe('Ready Evidence closure', () => {
  it('detects the single current Runtime and limits the closure surface', () => {
    expect(
      changedRuntimeTasks([
        'docs/tasks/runtime/M10-09.json',
        'docs/tasks/runtime/M10-09.json',
        'docs/test-evidence/M10-09/summary.md',
      ]),
    ).toEqual(['M10-09']);
    expect(
      isAllowedFinalClosurePath(
        'M10-09',
        'docs/tasks/M10/M10-09_EVIDENCE_CLOSURE_RACE.md',
        'docs/test-evidence/M10-09/summary.md',
      ),
    ).toBe(true);
    expect(
      isAllowedFinalClosurePath(
        'M10-09',
        'docs/tasks/M10/M10-09_EVIDENCE_CLOSURE_RACE.md',
        'scripts/evidence-policy.mjs',
      ),
    ).toBe(false);
  });

  it('accepts a Ready Head whose implementation commit is followed only by final closure files', async () => {
    const fixture = await readyClosureFixture();
    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.baseSha,
        expectedHead: fixture.head,
        final: true,
      }),
    ).resolves.toEqual([fixture.taskId]);

    const manifest = JSON.parse(
      await readFile(
        path.join(fixture.root, 'docs', 'test-evidence', fixture.taskId, 'manifest.json'),
        'utf8',
      ),
    );
    await expect(
      assertReadyEvidenceClosure(fixture.taskId, manifest, fixture.head, fixture.root),
    ).resolves.toEqual([
      'docs/test-evidence/M10-09/commands.txt',
      'docs/test-evidence/M10-09/known-risks.md',
      'docs/test-evidence/M10-09/manifest.json',
      'docs/test-evidence/M10-09/summary.md',
    ]);
  });

  it('allows stale intermediate Evidence on Draft but rejects it on Ready', async () => {
    const fixture = await readyClosureFixture();
    await writeFile(
      path.join(fixture.root, 'scripts', 'late-change.mjs'),
      'export const late = true;\n',
    );
    const staleHead = await commitAll(fixture.root, 'late implementation change');

    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.baseSha,
        expectedHead: staleHead,
      }),
    ).resolves.toEqual([fixture.taskId]);
    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.baseSha,
        expectedHead: staleHead,
        final: true,
      }),
    ).rejects.toThrow('non-closure changes follow implementationCommit: scripts/late-change.mjs');
  });

  it('rejects cross-task Evidence written after the current implementation commit', async () => {
    const fixture = await readyClosureFixture();
    await writeEvidencePackage(fixture.root, 'M10-08', fixture.implementationCommit);
    const crossTaskHead = await commitAll(fixture.root, 'late historical evidence');

    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.baseSha,
        expectedHead: crossTaskHead,
        final: true,
      }),
    ).rejects.toThrow('docs/test-evidence/M10-08/commands.txt');
  });

  it('requires the Ready current task to change its own Evidence package', async () => {
    const fixture = await gitFixture();
    await mkdir(path.join(fixture.root, 'docs', 'tasks', 'runtime'), { recursive: true });
    await writeFile(
      path.join(fixture.root, 'docs', 'tasks', 'runtime', 'M10-09.json'),
      '{"schemaVersion":2,"id":"M10-09","source":"docs/tasks/M10/M10-09.md"}\n',
    );
    const head = await commitAll(fixture.root, 'runtime only');
    await expect(
      validateChangedEvidenceAtHead({
        repositoryRoot: fixture.root,
        baseSha: fixture.sourceCommit,
        expectedHead: head,
        final: true,
      }),
    ).rejects.toThrow('Ready pull request must change the current task Evidence package');
  });
});

describe('final evidence semantics', () => {
  const documents = {
    summary: '# 验证摘要\n\n状态：Verified。',
    commands: 'pnpm test\nexit=0\n',
    knownRisks: '# 已知风险\n\n- 无。',
  };

  it('accepts committed documentation-only evidence with no stale state', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'a'.repeat(40) },
        documents,
      ),
    ).not.toThrow();
  });

  it('rejects working-tree and pending acceptance text', () => {
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'working-tree' },
        documents,
      ),
    ).toThrow('committed implementation revision');
    expect(() =>
      assertFinalEvidenceSemantics(
        'M2-01',
        { schemaVersion: 2, implementationCommit: 'a'.repeat(40) },
        {
          ...documents,
          summary: 'PENDING：等待CI。',
        },
      ),
    ).toThrow('stale implementation');
  });
});
